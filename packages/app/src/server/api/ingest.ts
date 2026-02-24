import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq } from "drizzle-orm";
import { validateApiKey } from "../middleware/api-auth";
import { createAuth } from "../auth";
import { generateEmbeddings } from "../lib/embeddings";
import { upsertVectors, deleteVectorsByLibrary } from "../lib/vectorize";
import { invalidateLibrary } from "../lib/cache";
import { checkRateLimit, rateLimitResponse } from "../middleware/rate-limit";

interface IngestChunk {
  id: string;
  title?: string;
  content: string;
  url?: string;
  tokenCount?: number;
}

interface IngestBody {
  libraryId: string;
  name: string;
  description?: string;
  sourceUrl?: string;
  sourceType?: string;
  version?: string;
  chunks: IngestChunk[];
  replace?: boolean;
  skipEmbeddings?: boolean;
}

async function getSessionUserId(request: Request): Promise<string | null> {
  try {
    const origin = new URL(request.url).origin;
    const auth = createAuth(env as any, origin);
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function handleIngest(request: Request): Promise<Response> {
  try {
    // Accept either API key (admin) or session auth
    const apiAuth = await validateApiKey(request, "admin");
    const sessionUserId = apiAuth ? null : await getSessionUserId(request);
    const userId = apiAuth?.userId ?? sessionUserId;

    if (!userId) {
      return Response.json({ error: "Unauthorized (admin API key or session required)" }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(apiAuth?.keyId ?? userId, "write", 10);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.retryAfter!);
    }

    const body: IngestBody = await request.json();
    const { libraryId, name, description, sourceUrl, sourceType, version, chunks, replace, skipEmbeddings } = body;

    if (!libraryId || !name || !chunks?.length) {
      return Response.json({ error: "libraryId, name, and chunks are required" }, { status: 400 });
    }

    const db = createDb(env.DB);

    // Check if library exists
    const [existing] = await db
      .select()
      .from(schema.libraries)
      .where(eq(schema.libraries.id, libraryId))
      .limit(1);

    if (existing && existing.ownerId !== userId) {
      return Response.json({ error: "You do not own this library" }, { status: 403 });
    }

    if (replace && existing) {
      await db.delete(schema.chunks).where(eq(schema.chunks.libraryId, libraryId));
      try { await deleteVectorsByLibrary(libraryId); } catch (e) { console.warn("Vectorize delete failed:", e); }
    }

    // Upsert library
    if (existing) {
      await db.update(schema.libraries).set({
        name, description, sourceUrl, sourceType, version,
        chunkCount: chunks.length,
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.libraries.id, libraryId));
    } else {
      await db.insert(schema.libraries).values({
        id: libraryId, name, description, sourceUrl,
        sourceType: sourceType ?? "llms_txt",
        version, chunkCount: chunks.length, ownerId: userId,
      });
    }

    // Insert chunks into D1 in small batches
    const chunkValues = chunks.map((c) => ({
      id: c.id, libraryId,
      title: c.title ?? null,
      content: c.content,
      url: c.url ?? null,
      tokenCount: c.tokenCount ?? null,
    }));

    // D1 limit: ~100 SQL variables per query. 6 columns per row = max 16 rows per batch.
    for (let i = 0; i < chunkValues.length; i += 10) {
      const batch = chunkValues.slice(i, i + 10);
      await db.insert(schema.chunks).values(batch);
    }

    // Generate embeddings and upsert to Vectorize
    // Skip for large batches (>50 chunks) to avoid Worker timeout;
    // embeddings can be generated later via a separate endpoint.
    let vectorizeSuccess = false;
    if (!skipEmbeddings && chunks.length <= 50) {
      try {
        const texts = chunks.map(
          (c) => `${c.title ? c.title + ": " : ""}${c.content}`.slice(0, 2000)
        );
        const embeddings = await generateEmbeddings(texts);
        const vectors = chunks.map((c, j) => ({
          id: c.id,
          values: embeddings[j],
          metadata: { chunkId: c.id, libraryId, title: c.title },
        }));
        await upsertVectors(vectors);
        vectorizeSuccess = true;
      } catch (e) {
        console.warn("Vectorize/AI embedding failed:", e);
      }
    } else {
      console.log(`Skipping embeddings for ${chunks.length} chunks (too many for single request). Use /api/embed to generate later.`);
    }

    // Invalidate cached context results for this library
    await invalidateLibrary(libraryId);

    // Backup raw docs to R2
    try {
      await env.DOCS_BUCKET.put(`${libraryId}/chunks.json`, JSON.stringify(chunks));
    } catch (e) {
      console.warn("R2 backup failed:", e);
    }

    return Response.json({
      success: true, libraryId,
      chunksIngested: chunks.length,
      vectorized: vectorizeSuccess,
    });
  } catch (e: any) {
    console.error("Ingest error:", e?.message, e?.stack);
    return Response.json({ error: `Ingest failed: ${e?.message}` }, { status: 500 });
  }
}
