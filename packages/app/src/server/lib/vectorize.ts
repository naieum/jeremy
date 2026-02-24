import { env } from "cloudflare:workers";

export interface VectorMetadata {
  chunkId: string;
  libraryId: string;
  title?: string;
}

export async function upsertVectors(
  vectors: { id: string; values: number[]; metadata: VectorMetadata }[]
) {
  // Vectorize supports up to 1000 vectors per upsert
  const batchSize = 1000;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    await env.VECTORIZE.upsert(batch);
  }
}

export async function queryVectors(
  vector: number[],
  options: {
    topK?: number;
    filter?: Record<string, string>;
  } = {}
) {
  const results = await env.VECTORIZE.query(vector, {
    topK: options.topK ?? 5,
    returnMetadata: "all",
    filter: options.filter,
  });
  return results.matches;
}

export async function deleteVectorsByLibrary(libraryId: string) {
  await env.VECTORIZE.deleteByMetadata({ libraryId });
}
