import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb, schema } from "~/server/db";
import { fetchLlmsTxt, chunkDocs } from "~/server/lib/llms-txt";
import { generateEmbeddings } from "~/server/lib/embeddings";
import { upsertVectors, deleteVectorsByLibrary } from "~/server/lib/vectorize";
import { assertValidFetchUrl } from "~/server/lib/url-validation";

export interface IngestParams {
  libraryId: string;
  name: string;
  description?: string;
  version?: string;
  sourceUrl: string;
  sourceType: string;
  ownerId: string;
}

export interface IngestResult {
  success: true;
  libraryId: string;
  chunksIngested: number;
  vectorized: boolean;
}

export async function ingestFromUrl(params: IngestParams): Promise<IngestResult> {
  const { libraryId, name, description, version, sourceUrl, sourceType, ownerId } = params;

  // Validate URL before fetching (SSRF prevention)
  assertValidFetchUrl(sourceUrl);

  // Fetch and chunk docs from the URL
  let docs;
  if (sourceType === "llms_txt" || sourceUrl.includes("llms")) {
    docs = await fetchLlmsTxt(sourceUrl);
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    const content = await res.text();
    docs = [{ title: name, content, url: sourceUrl }];
  }

  const chunks = chunkDocs(libraryId, docs);
  if (chunks.length === 0) {
    throw new Error("No content found at the provided URL");
  }

  const db = createDb(env.DB);

  // Check if library exists and replace
  const [existing] = await db.select().from(schema.libraries)
    .where(eq(schema.libraries.id, libraryId)).limit(1);

  if (existing) {
    // Ownership check: only the owner can update a library
    if (existing.ownerId !== ownerId) {
      throw new Error("You do not own this library");
    }
    await db.delete(schema.chunks).where(eq(schema.chunks.libraryId, libraryId));
    try { await deleteVectorsByLibrary(libraryId); } catch {}
    await db.update(schema.libraries).set({
      name,
      description,
      version,
      sourceUrl,
      sourceType: sourceType || "llms_txt",
      chunkCount: chunks.length,
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.libraries.id, libraryId));
  } else {
    await db.insert(schema.libraries).values({
      id: libraryId,
      name,
      description,
      version,
      sourceUrl,
      sourceType: sourceType || "llms_txt",
      chunkCount: chunks.length,
      ownerId,
    });
  }

  // Insert chunks
  const chunkValues = chunks.map(c => ({
    id: c.id,
    libraryId,
    title: c.title,
    content: c.content,
    url: c.url,
    tokenCount: c.tokenCount,
  }));
  for (let i = 0; i < chunkValues.length; i += 500) {
    await db.insert(schema.chunks).values(chunkValues.slice(i, i + 500));
  }

  // Generate embeddings and upsert vectors
  let vectorized = false;
  try {
    const texts = chunks.map(c => `${c.title}: ${c.content}`);
    const embeddings = await generateEmbeddings(texts);
    const vectors = chunks.map((c, i) => ({
      id: c.id,
      values: embeddings[i],
      metadata: { chunkId: c.id, libraryId, title: c.title },
    }));
    await upsertVectors(vectors);
    vectorized = true;
  } catch (e) {
    console.warn("Embedding/Vectorize failed:", e);
  }

  // R2 backup
  try {
    await env.DOCS_BUCKET.put(`${libraryId}/chunks.json`, JSON.stringify(chunks));
  } catch {}

  return { success: true, libraryId, chunksIngested: chunks.length, vectorized };
}
