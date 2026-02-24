import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq, sql } from "drizzle-orm";
import { validateApiKey } from "../middleware/api-auth";
import { createAuth } from "../auth";
import { generateEmbeddings } from "../lib/embeddings";
import { upsertVectors } from "../lib/vectorize";

interface EmbedBody {
  libraryId: string;
  limit?: number;
  offset?: number;
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

export async function handleEmbed(request: Request): Promise<Response> {
  try {
    const apiAuth = await validateApiKey(request, "admin");
    const sessionUserId = apiAuth ? null : await getSessionUserId(request);
    const userId = apiAuth?.userId ?? sessionUserId;

    if (!userId) {
      return Response.json({ error: "Unauthorized (admin API key or session required)" }, { status: 401 });
    }

    const body: EmbedBody = await request.json();
    const { libraryId, limit = 200, offset = 0 } = body;

    if (!libraryId) {
      return Response.json({ error: "libraryId is required" }, { status: 400 });
    }

    const db = createDb(env.DB);

    // Get total chunk count for this library
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.chunks)
      .where(eq(schema.chunks.libraryId, libraryId));
    const totalChunks = countResult?.count ?? 0;

    if (totalChunks === 0) {
      return Response.json({ libraryId, processed: 0, total: 0, done: true });
    }

    // Fetch chunks for this batch
    const chunkBatch = await db
      .select({ id: schema.chunks.id, title: schema.chunks.title, content: schema.chunks.content })
      .from(schema.chunks)
      .where(eq(schema.chunks.libraryId, libraryId))
      .limit(limit)
      .offset(offset);

    if (chunkBatch.length === 0) {
      return Response.json({ libraryId, processed: 0, total: totalChunks, offset, done: true });
    }

    // Generate embeddings (100 texts per AI call)
    const texts = chunkBatch.map(
      (c) => `${c.title ? c.title + ": " : ""}${c.content}`.slice(0, 2000)
    );
    const embeddings = await generateEmbeddings(texts);

    // Upsert to Vectorize
    const vectors = chunkBatch.map((c, j) => ({
      id: c.id,
      values: embeddings[j],
      metadata: { chunkId: c.id, libraryId, title: c.title },
    }));
    await upsertVectors(vectors);

    const nextOffset = offset + chunkBatch.length;
    const done = nextOffset >= totalChunks;

    return Response.json({
      libraryId,
      processed: chunkBatch.length,
      total: totalChunks,
      offset,
      nextOffset: done ? null : nextOffset,
      done,
    });
  } catch (e: any) {
    console.error("Embed error:", e?.message, e?.stack);
    return Response.json({ error: `Embed failed: ${e?.message}` }, { status: 500 });
  }
}
