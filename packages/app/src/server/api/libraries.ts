import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq, and, or, count } from "drizzle-orm";
import { deleteVectorsByLibrary } from "../lib/vectorize";

export async function handleListLibraries(userId: string): Promise<Response> {
  const db = createDb(env.DB);
  const results = await db
    .select()
    .from(schema.libraries)
    .where(eq(schema.libraries.ownerId, userId));
  return Response.json({ libraries: results });
}

export async function handleGetLibrary(id: string, userId: string, limit = 100, offset = 0): Promise<Response> {
  const db = createDb(env.DB);
  const [library] = await db
    .select()
    .from(schema.libraries)
    .where(and(
      eq(schema.libraries.id, id),
      or(eq(schema.libraries.ownerId, userId), eq(schema.libraries.isPublic, 1))
    ))
    .limit(1);

  if (!library) {
    return Response.json({ error: "Library not found" }, { status: 404 });
  }

  const chunkList = await db
    .select({
      id: schema.chunks.id,
      title: schema.chunks.title,
      url: schema.chunks.url,
      tokenCount: schema.chunks.tokenCount,
    })
    .from(schema.chunks)
    .where(eq(schema.chunks.libraryId, id))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.chunks)
    .where(eq(schema.chunks.libraryId, id));

  return Response.json({ library, chunks: chunkList, total, hasMore: offset + chunkList.length < total });
}

export async function handleDeleteLibrary(id: string, userId: string): Promise<Response> {
  const db = createDb(env.DB);

  const [library] = await db
    .select()
    .from(schema.libraries)
    .where(and(eq(schema.libraries.id, id), eq(schema.libraries.ownerId, userId)))
    .limit(1);

  if (!library) {
    return Response.json({ error: "Library not found" }, { status: 404 });
  }

  // Delete chunks and library
  await db.delete(schema.chunks).where(eq(schema.chunks.libraryId, id));
  await db.delete(schema.libraries).where(eq(schema.libraries.id, id));

  // Clean up vectors and R2 (may fail in local dev)
  try { await deleteVectorsByLibrary(id); } catch (e) { console.warn("Vectorize cleanup failed:", e); }
  try { await env.DOCS_BUCKET.delete(`${id}/chunks.json`); } catch (e) { console.warn("R2 cleanup failed:", e); }

  return Response.json({ success: true });
}
