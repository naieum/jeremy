import { env } from "cloudflare:workers";
import { getCached, setCache, hashCacheKey } from "./cache";

const EMBEDDING_CACHE_TTL = 86400; // 24 hours

export async function generateEmbedding(text: string): Promise<number[]> {
  const hash = await hashCacheKey(text);
  const cacheKey = `emb:${hash}`;

  const cached = await getCached<number[]>(cacheKey);
  if (cached) return cached;

  const result = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
    text: [text],
  });
  const embedding = result.data[0];

  await setCache(cacheKey, embedding, EMBEDDING_CACHE_TTL);
  return embedding;
}

export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const batchSize = 100;
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const uncachedIndices: number[] = [];

  // Compute all hashes and check KV cache in parallel
  const hashes = await Promise.all(texts.map((t) => hashCacheKey(t)));
  const cacheResults = await Promise.all(
    hashes.map((h) => getCached<number[]>(`emb:${h}`))
  );
  for (let i = 0; i < texts.length; i++) {
    if (cacheResults[i]) {
      results[i] = cacheResults[i];
    } else {
      uncachedIndices.push(i);
    }
  }

  // Batch-embed only uncached texts
  const uncachedTexts = uncachedIndices.map((i) => texts[i]);
  for (let i = 0; i < uncachedTexts.length; i += batchSize) {
    const batch = uncachedTexts.slice(i, i + batchSize);
    const batchIndices = uncachedIndices.slice(i, i + batchSize);
    const result = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
      text: batch,
    });

    // Write new embeddings to cache in parallel (reuse precomputed hashes)
    const cacheWrites: Promise<void>[] = [];
    for (let j = 0; j < result.data.length; j++) {
      results[batchIndices[j]] = result.data[j];
      const hash = hashes[uncachedIndices[i + j]];
      cacheWrites.push(
        setCache(`emb:${hash}`, result.data[j], EMBEDDING_CACHE_TTL)
      );
    }
    await Promise.all(cacheWrites);
  }

  return results as number[][];
}
