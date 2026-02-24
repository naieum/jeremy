import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { and, eq, like, or } from "drizzle-orm";
import { validateApiKey } from "../middleware/api-auth";
import { getCached, setCache, hashCacheKey } from "../lib/cache";
import { checkRateLimit, rateLimitResponse } from "../middleware/rate-limit";

const SEARCH_CACHE_TTL = 300; // 5 minutes

export async function handleSearch(request: Request): Promise<Response> {
  const auth = await validateApiKey(request);
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(auth.keyId, "read", 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfter!);
  }

  const url = new URL(request.url);
  const libraryName = url.searchParams.get("libraryName");
  const version = url.searchParams.get("version");
  const query = url.searchParams.get("query");

  if (!libraryName) {
    return Response.json(
      { error: "libraryName parameter is required" },
      { status: 400 }
    );
  }

  // Check cache
  const searchHash = await hashCacheKey(`${libraryName}:${version ?? ""}`, auth.userId);
  const searchCacheKey = `search:${searchHash}`;
  const cached = await getCached<any>(searchCacheKey);
  if (cached) {
    return Response.json(cached);
  }

  const db = createDb(env.DB);

  // Access filter: only show libraries owned by the user or public
  const accessFilter = or(
    eq(schema.libraries.ownerId, auth.userId),
    eq(schema.libraries.isPublic, 1)
  );

  // Try exact match first (common MCP case: user passes exact library ID/name)
  const exactResults = await db
    .select({
      id: schema.libraries.id,
      name: schema.libraries.name,
      description: schema.libraries.description,
      version: schema.libraries.version,
      chunkCount: schema.libraries.chunkCount,
    })
    .from(schema.libraries)
    .where(
      and(
        or(
          eq(schema.libraries.id, libraryName),
          eq(schema.libraries.name, libraryName)
        ),
        accessFilter,
        ...(version ? [eq(schema.libraries.version, version)] : [])
      )
    )
    .limit(10);

  if (exactResults.length > 0) {
    const responseData = { libraries: exactResults };
    await setCache(searchCacheKey, responseData, SEARCH_CACHE_TTL);
    return Response.json(responseData);
  }

  // Fall back to LIKE search
  const searchTerm = `%${libraryName}%`;
  const results = await db
    .select({
      id: schema.libraries.id,
      name: schema.libraries.name,
      description: schema.libraries.description,
      version: schema.libraries.version,
      chunkCount: schema.libraries.chunkCount,
    })
    .from(schema.libraries)
    .where(
      and(
        or(
          like(schema.libraries.name, searchTerm),
          like(schema.libraries.id, searchTerm)
        ),
        accessFilter,
        ...(version ? [eq(schema.libraries.version, version)] : [])
      )
    )
    .limit(10);

  const responseData = { libraries: results };
  await setCache(searchCacheKey, responseData, SEARCH_CACHE_TTL);
  return Response.json(responseData);
}
