import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq, and, or, lt, isNotNull } from "drizzle-orm";
import { fetchLlmsTxt, chunkDocs } from "../lib/llms-txt";
import { generateEmbeddings } from "../lib/embeddings";
import { upsertVectors, deleteVectorsByLibrary } from "../lib/vectorize";
import { invalidateLibrary, hashCacheKey } from "../lib/cache";
import { crawlAndIngest } from "../lib/crawl";
import {
  runDiscoverySources,
  processDiscoveryQueue,
} from "../lib/discovery/runner";

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  return (crypto.subtle as any).timingSafeEqual(bufA, bufB);
}

const MAX_LIBRARIES_PER_RUN = 2;
const MAX_CRAWL_PER_RUN = 1;
const CRAWL_MAX_PAGES = 50;
const STALE_DAYS = 14;

export async function handleCronRefresh(request: Request): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = (env as any).CRON_SECRET;

  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  if (!timingSafeEqual(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createDb(env.DB);
  const staleDate = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
  const results: { libraryId: string; status: string; chunks?: number }[] = [];

  // Process llms_txt and github libraries first (fast)
  const staleTextLibraries = await db
    .select()
    .from(schema.libraries)
    .where(
      and(
        or(
          eq(schema.libraries.sourceType, "llms_txt"),
          eq(schema.libraries.sourceType, "github")
        ),
        lt(schema.libraries.updatedAt, staleDate),
        isNotNull(schema.libraries.sourceUrl)
      )
    )
    .limit(MAX_LIBRARIES_PER_RUN);

  for (const library of staleTextLibraries) {
    if (!library.sourceUrl) continue;

    try {
      if (library.sourceType === "llms_txt") {
        const docs = await fetchLlmsTxt(library.sourceUrl);
        const chunks = chunkDocs(library.id, docs);

        if (chunks.length === 0) {
          results.push({ libraryId: library.id, status: "skipped_no_content" });
          continue;
        }

        // Content hash check — skip re-embedding if unchanged
        const rawContent = chunks.map((c) => c.content).join("\n");
        const contentHash = await hashCacheKey(rawContent);
        if (contentHash === library.contentHash) {
          await db.update(schema.libraries).set({
            updatedAt: new Date().toISOString(),
          }).where(eq(schema.libraries.id, library.id));
          results.push({ libraryId: library.id, status: "skipped_unchanged" });
          continue;
        }

        await db.delete(schema.chunks).where(eq(schema.chunks.libraryId, library.id));
        try { await deleteVectorsByLibrary(library.id); } catch {}

        await db.update(schema.libraries).set({
          chunkCount: chunks.length,
          contentHash,
          updatedAt: new Date().toISOString(),
        }).where(eq(schema.libraries.id, library.id));

        const chunkValues = chunks.map((c) => ({
          id: c.id,
          libraryId: library.id,
          title: c.title,
          content: c.content,
          url: c.url,
          tokenCount: c.tokenCount,
        }));
        for (let i = 0; i < chunkValues.length; i += 10) {
          await db.insert(schema.chunks).values(chunkValues.slice(i, i + 10));
        }

        try {
          const texts = chunks.map((c) => `${c.title}: ${c.content}`.slice(0, 2000));
          const embeddings = await generateEmbeddings(texts);
          const vectors = chunks.map((c, j) => ({
            id: c.id,
            values: embeddings[j],
            metadata: { chunkId: c.id, libraryId: library.id, title: c.title },
          }));
          await upsertVectors(vectors);
        } catch (e) {
          console.warn(`Embedding failed for ${library.id}:`, e);
        }

        try {
          await env.DOCS_BUCKET.put(`${library.id}/chunks.json`, JSON.stringify(chunks));
        } catch {}

        await invalidateLibrary(library.id);
        results.push({ libraryId: library.id, status: "refreshed", chunks: chunks.length });

      } else if (library.sourceType === "github") {
        // Re-ingest from connected GitHub repo
        const [connection] = await db
          .select()
          .from(schema.repoConnections)
          .where(eq(schema.repoConnections.libraryId, library.id))
          .limit(1);

        if (!connection || !connection.verifiedAt) {
          results.push({ libraryId: library.id, status: "skipped_no_verified_connection" });
          continue;
        }

        const { repoOwner, repoName } = connection;

        let ingestChunks: any[] = [];
        try {
          const llmsTxtRes = await fetch(
            `https://api.github.com/repos/${repoOwner}/${repoName}/contents/llms.txt`,
            { headers: { "User-Agent": "Jeremy-App", Accept: "application/vnd.github.v3+json" } }
          );
          if (llmsTxtRes.ok) {
            const fileData = (await llmsTxtRes.json()) as { download_url?: string };
            if (fileData.download_url) {
              const docs = await fetchLlmsTxt(fileData.download_url);
              ingestChunks = chunkDocs(library.id, docs);
            }
          }
        } catch {}

        if (ingestChunks.length === 0) {
          const treeRes = await fetch(
            `https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/HEAD?recursive=1`,
            { headers: { "User-Agent": "Jeremy-App", Accept: "application/vnd.github.v3+json" } }
          );
          if (treeRes.ok) {
            const tree = (await treeRes.json()) as { tree: Array<{ path: string; type: string }> };
            const skipDirs = ["node_modules", ".github", ".git", "vendor", "dist", "build"];
            const mdFiles = tree.tree.filter((item) => {
              if (item.type !== "blob") return false;
              if (!/\.(md|mdx)$/i.test(item.path)) return false;
              return !skipDirs.some((dir) => item.path.startsWith(dir + "/"));
            }).slice(0, 100);

            // Fetch files in parallel batches of 10 to avoid GitHub rate limits
            let chunkIdx = 0;
            const CONCURRENCY = 10;
            for (let batch = 0; batch < mdFiles.length; batch += CONCURRENCY) {
              const fileBatch = mdFiles.slice(batch, batch + CONCURRENCY);
              const results = await Promise.allSettled(
                fileBatch.map(async (file) => {
                  const contentRes = await fetch(
                    `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${file.path}`,
                    { headers: { "User-Agent": "Jeremy-App", Accept: "application/vnd.github.v3+json" } }
                  );
                  if (!contentRes.ok) return null;
                  const fileData = (await contentRes.json()) as { content?: string; encoding?: string };
                  if (!fileData.content || fileData.encoding !== "base64") return null;
                  const content = atob(fileData.content);
                  if (content.trim().length < 50) return null;

                  const titleMatch = content.match(/^#\s+(.+)/m);
                  const title = titleMatch ? titleMatch[1].trim() : file.path.replace(/\.(md|mdx)$/i, "").split("/").pop() ?? file.path;
                  const url = `https://github.com/${repoOwner}/${repoName}/blob/HEAD/${file.path}`;

                  return { title, content: content.slice(0, 8000), url, tokenCount: Math.ceil(content.length / 4) };
                })
              );
              for (const result of results) {
                if (result.status === "fulfilled" && result.value) {
                  ingestChunks.push({
                    id: `${library.id}:gh:${chunkIdx++}`,
                    ...result.value,
                  });
                }
              }
            }
          }
        }

        if (ingestChunks.length > 0) {
          // Content hash check — skip re-embedding if unchanged
          const rawContent = ingestChunks.map((c: any) => c.content).join("\n");
          const contentHash = await hashCacheKey(rawContent);
          if (contentHash === library.contentHash) {
            await db.update(schema.libraries).set({
              updatedAt: new Date().toISOString(),
            }).where(eq(schema.libraries.id, library.id));
            results.push({ libraryId: library.id, status: "skipped_unchanged" });
            continue;
          }

          await db.delete(schema.chunks).where(eq(schema.chunks.libraryId, library.id));
          try { await deleteVectorsByLibrary(library.id); } catch {}

          await db.update(schema.libraries).set({
            chunkCount: ingestChunks.length,
            contentHash,
            updatedAt: new Date().toISOString(),
          }).where(eq(schema.libraries.id, library.id));

          for (let i = 0; i < ingestChunks.length; i += 10) {
            await db.insert(schema.chunks).values(
              ingestChunks.slice(i, i + 10).map((c: any) => ({
                id: c.id, libraryId: library.id,
                title: c.title ?? null, content: c.content,
                url: c.url ?? null, tokenCount: c.tokenCount ?? null,
              }))
            );
          }

          try {
            const texts = ingestChunks.map((c: any) => `${c.title ? c.title + ": " : ""}${c.content}`.slice(0, 2000));
            const embeddings = await generateEmbeddings(texts);
            const vectors = ingestChunks.map((c: any, j: number) => ({
              id: c.id, values: embeddings[j],
              metadata: { chunkId: c.id, libraryId: library.id, title: c.title },
            }));
            await upsertVectors(vectors);
          } catch (e) {
            console.warn(`Embedding failed for ${library.id}:`, e);
          }

          await invalidateLibrary(library.id);

          await db.update(schema.repoConnections).set({
            lastIngestedAt: new Date().toISOString(),
          }).where(eq(schema.repoConnections.id, connection.id));

          // Auto-rebuild docs if live
          const [docSite] = await db.select().from(schema.docSites)
            .where(eq(schema.docSites.libraryId, library.id)).limit(1);
          if (docSite && docSite.status === "live") {
            try {
              const { generateAndUploadDocs } = await import("../lib/docs-generator");
              await generateAndUploadDocs(library.id, docSite.subdomain);
              await db.update(schema.docSites).set({ lastBuiltAt: new Date().toISOString() })
                .where(eq(schema.docSites.id, docSite.id));
            } catch (e) {
              console.warn(`Docs rebuild failed for ${library.id}:`, e);
            }
          }

          results.push({ libraryId: library.id, status: "refreshed_from_github", chunks: ingestChunks.length });
        } else {
          results.push({ libraryId: library.id, status: "skipped_no_content" });
        }
      }
    } catch (e: any) {
      results.push({ libraryId: library.id, status: `error: ${e.message}` });
    }
  }

  // Process crawl libraries last (slowest — uses Browser Rendering)
  const staleCrawlLibraries = await db
    .select()
    .from(schema.libraries)
    .where(
      and(
        eq(schema.libraries.sourceType, "crawl"),
        lt(schema.libraries.updatedAt, staleDate),
        isNotNull(schema.libraries.sourceUrl)
      )
    )
    .limit(MAX_CRAWL_PER_RUN);

  for (const library of staleCrawlLibraries) {
    if (!library.sourceUrl) continue;

    try {
      const crawlResult = await crawlAndIngest({
        libraryId: library.id,
        name: library.name,
        description: library.description ?? undefined,
        urls: [library.sourceUrl],
        replace: true,
        ownerId: library.ownerId,
        maxPages: CRAWL_MAX_PAGES,
      });

      // Auto-rebuild docs if live
      const [docSite] = await db.select().from(schema.docSites)
        .where(eq(schema.docSites.libraryId, library.id)).limit(1);
      if (docSite && docSite.status === "live") {
        try {
          const { generateAndUploadDocs } = await import("../lib/docs-generator");
          await generateAndUploadDocs(library.id, docSite.subdomain);
          await db.update(schema.docSites).set({ lastBuiltAt: new Date().toISOString() })
            .where(eq(schema.docSites.id, docSite.id));
        } catch (e) {
          console.warn(`Docs rebuild failed for ${library.id}:`, e);
        }
      }

      results.push({
        libraryId: library.id,
        status: "recrawled",
        chunks: crawlResult.chunksIngested,
      });
    } catch (e: any) {
      // Update timestamp to prevent retry storm, but set to 4 days ago
      // so it retries sooner than the full 7-day stale period
      const retryDate = new Date(Date.now() - 4 * 86400_000).toISOString();
      await db.update(schema.libraries).set({
        updatedAt: retryDate,
      }).where(eq(schema.libraries.id, library.id));

      console.error(`Crawl failed for ${library.id}:`, e.message);
      results.push({ libraryId: library.id, status: `crawl_error: ${e.message}` });
    }
  }

  return Response.json({
    refreshed: results.length,
    staleTextFound: staleTextLibraries.length,
    staleCrawlFound: staleCrawlLibraries.length,
    results,
  });
}

export async function handleDiscoveryCron(request: Request): Promise<Response> {
  // Auth: Bearer token or admin session
  const authHeader = request.headers.get("Authorization");
  const cronSecret = (env as any).CRON_SECRET;
  const adminUserId = (env as any).ADMIN_USER_ID;

  if (!cronSecret) {
    return Response.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  let isAuthed = authHeader ? timingSafeEqual(authHeader, `Bearer ${cronSecret}`) : false;

  // Fallback: check admin session cookie
  if (!isAuthed) {
    try {
      const origin = new URL(request.url).origin;
      const { createAuth } = await import("../auth");
      const auth = createAuth(env as any, origin);
      const session = await auth.api.getSession({
        headers: request.headers,
      });
      if (session?.user?.id === adminUserId) {
        isAuthed = true;
      }
    } catch {}
  }

  if (!isAuthed) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sourceResult = await runDiscoverySources();
    const queueResult = await processDiscoveryQueue({
      adminUserId,
      maxLlmsIngest: 3,
      maxCrawl: 1,
    });

    return Response.json({
      ...sourceResult,
      ...queueResult,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
