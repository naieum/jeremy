import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq, inArray, like, or } from "drizzle-orm";
import { validateApiKey } from "../middleware/api-auth";
import { generateEmbedding } from "../lib/embeddings";
import { queryVectors } from "../lib/vectorize";
import { getCached, setCache, hashCacheKey } from "../lib/cache";
import { checkRateLimit, rateLimitResponse } from "../middleware/rate-limit";

const CONTEXT_CACHE_TTL = 3600; // 1 hour

function applyTokenBudget(
  chunks: { id: string; title: string; content: string; url: string | null; tokenCount: number | null }[],
  maxTokens: number | undefined
) {
  if (maxTokens === undefined) return chunks;
  const result: typeof chunks = [];
  let remaining = maxTokens;
  for (const chunk of chunks) {
    const cost = chunk.tokenCount ?? Math.ceil(chunk.content.length / 4);
    if (cost <= remaining) {
      result.push(chunk);
      remaining -= cost;
    } else {
      break;
    }
  }
  return result;
}

export async function handleContext(request: Request): Promise<Response> {
  const auth = await validateApiKey(request);
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(auth.keyId, "read", 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfter!);
  }

  const url = new URL(request.url);
  const libraryId = url.searchParams.get("libraryId");
  const query = url.searchParams.get("query");
  const topK = parseInt(url.searchParams.get("topK") ?? "5");
  const maxTokens = url.searchParams.get("maxTokens")
    ? parseInt(url.searchParams.get("maxTokens")!)
    : undefined;

  if (!libraryId || !query) {
    return Response.json(
      { error: "libraryId and query parameters are required" },
      { status: 400 }
    );
  }

  // Verify the user has access to this library
  const db0 = createDb(env.DB);
  const [library] = await db0
    .select({ ownerId: schema.libraries.ownerId, isPublic: schema.libraries.isPublic })
    .from(schema.libraries)
    .where(eq(schema.libraries.id, libraryId))
    .limit(1);

  if (!library) {
    return Response.json({ error: "Library not found" }, { status: 404 });
  }

  if (library.ownerId !== auth.userId && library.isPublic !== 1) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check for cached full response
  const contextHash = await hashCacheKey(libraryId, query, String(topK), String(maxTokens ?? ""));
  const contextCacheKey = `ctx:${libraryId}:${contextHash}`;
  const cachedResponse = await getCached<any>(contextCacheKey);
  if (cachedResponse) {
    return Response.json(cachedResponse);
  }

  // Try semantic search via Vectorize first
  try {
    const queryEmbedding = await generateEmbedding(query);

    // Try with metadata filter first; if empty or error, query unfiltered + client-side filter
    let matches: any[] = [];
    try {
      matches = await queryVectors(queryEmbedding, {
        topK,
        filter: { libraryId },
      });
    } catch {
      // Filter failed — will try unfiltered below
    }

    if (matches.length === 0) {
      // Metadata index may not cover pre-existing vectors — query unfiltered
      const allMatches = await queryVectors(queryEmbedding, { topK: Math.max(topK * 10, 50) });
      matches = allMatches.filter((m: any) => m.metadata?.libraryId === libraryId).slice(0, topK);
    }

    if (matches.length > 0) {
      const chunkIds = matches.map((m: any) => m.metadata?.chunkId as string).filter(Boolean);
      const db = createDb(env.DB);

      const chunkResults = await db
        .select()
        .from(schema.chunks)
        .where(inArray(schema.chunks.id, chunkIds));

      const chunkMap = new Map(chunkResults.map((c) => [c.id, c]));
      const orderedChunks = chunkIds
        .map((id) => chunkMap.get(id))
        .filter(Boolean)
        .map((chunk) => ({
          id: chunk!.id,
          title: chunk!.title,
          content: chunk!.content,
          url: chunk!.url,
          tokenCount: chunk!.tokenCount,
        }));

      const budgeted = applyTokenBudget(orderedChunks, maxTokens);
      const responseData = { chunks: budgeted, libraryId, query };
      await setCache(contextCacheKey, responseData, CONTEXT_CACHE_TTL);
      return Response.json(responseData);
    }
  } catch (e) {
    console.warn("Vectorize search failed, falling back to D1 text search:", e);
  }

  // Fallback: text search in D1 (fetch more rows, then filter client-side)
  const db = createDb(env.DB);
  const fallbackChunks = await db
    .select()
    .from(schema.chunks)
    .where(eq(schema.chunks.libraryId, libraryId))
    .limit(200);

  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(Boolean);

  const scored = fallbackChunks
    .map((c) => {
      const text = `${c.title ?? ""} ${c.content}`.toLowerCase();
      const termMatches = queryTerms.filter((t) => text.includes(t)).length;
      return { chunk: c, score: termMatches };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => ({
      id: s.chunk.id,
      title: s.chunk.title,
      content: s.chunk.content,
      url: s.chunk.url,
      tokenCount: s.chunk.tokenCount,
    }));

  const budgetedScored = applyTokenBudget(scored, maxTokens);
  const responseData = { chunks: budgetedScored, libraryId, query, fallback: true };
  await setCache(contextCacheKey, responseData, CONTEXT_CACHE_TTL);
  return Response.json(responseData);
}
