import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq, and, or, lt, isNotNull } from "drizzle-orm";
import { fetchLlmsTxt, chunkDocs } from "../lib/llms-txt";
import { generateEmbeddings } from "../lib/embeddings";
import { upsertVectors, deleteVectorsByLibrary } from "../lib/vectorize";
import { invalidateLibrary } from "../lib/cache";

const MAX_LIBRARIES_PER_RUN = 3;
const STALE_DAYS = 7;

export async function handleCronRefresh(request: Request): Promise<Response> {
  // Validate CRON_SECRET
  const authHeader = request.headers.get("Authorization");
  const cronSecret = (env as any).CRON_SECRET;

  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createDb(env.DB);

  // Find stale libraries with a sourceUrl that were crawled or ingested via llms_txt
  const staleDate = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();

  const staleLibraries = await db
    .select()
    .from(schema.libraries)
    .where(
      and(
        or(
          eq(schema.libraries.sourceType, "crawl"),
          eq(schema.libraries.sourceType, "llms_txt"),
          eq(schema.libraries.sourceType, "github")
        ),
        lt(schema.libraries.updatedAt, staleDate),
        or(
          isNotNull(schema.libraries.sourceUrl),
          eq(schema.libraries.sourceType, "github")
        )
      )
    )
    .limit(MAX_LIBRARIES_PER_RUN);

  const results: { libraryId: string; status: string; chunks?: number }[] = [];

  for (const library of staleLibraries) {
    if (!library.sourceUrl) continue;

    try {
      if (library.sourceType === "llms_txt") {
        // Re-fetch and re-ingest from llms.txt URL
        const docs = await fetchLlmsTxt(library.sourceUrl);
        const chunks = chunkDocs(library.id, docs);

        if (chunks.length === 0) {
          results.push({ libraryId: library.id, status: "skipped_no_content" });
          continue;
        }

        // Delete old chunks and vectors
        await db.delete(schema.chunks).where(eq(schema.chunks.libraryId, library.id));
        try { await deleteVectorsByLibrary(library.id); } catch {}

        // Update library
        await db.update(schema.libraries).set({
          chunkCount: chunks.length,
          updatedAt: new Date().toISOString(),
        }).where(eq(schema.libraries.id, library.id));

        // Insert new chunks
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

        // Generate embeddings
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

        // R2 backup
        try {
          await env.DOCS_BUCKET.put(`${library.id}/chunks.json`, JSON.stringify(chunks));
        } catch {}

        await invalidateLibrary(library.id);
        results.push({ libraryId: library.id, status: "refreshed", chunks: chunks.length });

      } else if (library.sourceType === "crawl") {
        // For crawl libraries, we just update the timestamp to mark as "checked"
        // Full re-crawl requires browser rendering which is too heavy for cron
        // Instead, mark as needing manual refresh
        await db.update(schema.libraries).set({
          updatedAt: new Date().toISOString(),
        }).where(eq(schema.libraries.id, library.id));

        results.push({ libraryId: library.id, status: "timestamp_updated" });
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

        // Trigger re-ingest via internal API
        try {
          const baseUrl = (env as any).BASE_URL;
          const cronSecret = (env as any).CRON_SECRET;
          // Use direct function call since we're in the same worker
          const { handleRepoIngest } = await import("./repos");
          // Create a minimal request for the ingest handler
          const ingestRequest = new Request(`${baseUrl}/api/libraries/${library.id}/repo/ingest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          // Note: this requires session auth which won't work from cron.
          // Instead, do the ingest inline
          const { repoOwner, repoName } = connection;

          // Try llms.txt first
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

          // Fall back to markdown scanning
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

              let chunkIdx = 0;
              for (const file of mdFiles) {
                try {
                  const contentRes = await fetch(
                    `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${file.path}`,
                    { headers: { "User-Agent": "Jeremy-App", Accept: "application/vnd.github.v3+json" } }
                  );
                  if (!contentRes.ok) continue;
                  const fileData = (await contentRes.json()) as { content?: string; encoding?: string };
                  if (!fileData.content || fileData.encoding !== "base64") continue;
                  const content = atob(fileData.content);
                  if (content.trim().length < 50) continue;

                  const titleMatch = content.match(/^#\s+(.+)/m);
                  const title = titleMatch ? titleMatch[1].trim() : file.path.replace(/\.(md|mdx)$/i, "").split("/").pop() ?? file.path;
                  const url = `https://github.com/${repoOwner}/${repoName}/blob/HEAD/${file.path}`;

                  ingestChunks.push({
                    id: `${library.id}:gh:${chunkIdx++}`,
                    title,
                    content: content.slice(0, 8000),
                    url,
                    tokenCount: Math.ceil(content.length / 4),
                  });
                } catch {}
              }
            }
          }

          if (ingestChunks.length > 0) {
            // Delete old chunks and re-insert
            await db.delete(schema.chunks).where(eq(schema.chunks.libraryId, library.id));
            try { await deleteVectorsByLibrary(library.id); } catch {}

            await db.update(schema.libraries).set({
              chunkCount: ingestChunks.length,
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

            // Embeddings
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

            // Update connection timestamp
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
        } catch (e: any) {
          results.push({ libraryId: library.id, status: `github_error: ${e.message}` });
        }
      }
    } catch (e: any) {
      results.push({ libraryId: library.id, status: `error: ${e.message}` });
    }
  }

  return Response.json({
    refreshed: results.length,
    staleFound: staleLibraries.length,
    results,
  });
}
