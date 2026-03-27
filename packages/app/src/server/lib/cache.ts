import { env } from "cloudflare:workers";

export async function hashCacheKey(...parts: string[]): Promise<string> {
  const encoder = new TextEncoder();
  // Length-prefix each part to prevent separator collisions
  // e.g. ("a:b", "c") vs ("a", "b:c") now produce different hashes
  const data = encoder.encode(parts.map((p) => `${p.length}:${p}`).join("\0"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const value = await env.CACHE.get(key, "text");
    if (value === null) return null;
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  try {
    await env.CACHE.put(key, JSON.stringify(value), {
      expirationTtl: ttlSeconds,
    });
  } catch (e) {
    console.warn("Cache write failed:", e);
  }
}

export async function invalidateLibrary(libraryId: string): Promise<void> {
  try {
    // List and delete all context cache entries for this library
    // Paginate through all keys to handle >1000 entries
    const prefix = `ctx:${libraryId}:`;
    let cursor: string | undefined;
    do {
      const list = await env.CACHE.list({ prefix, cursor });
      if (list.keys.length > 0) {
        await Promise.all(list.keys.map((key) => env.CACHE.delete(key.name)));
      }
      cursor = list.list_complete ? undefined : (list as any).cursor;
    } while (cursor);
  } catch (e) {
    console.warn("Cache invalidation failed:", e);
  }
}
