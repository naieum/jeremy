import { env } from "cloudflare:workers";

export async function hashCacheKey(...parts: string[]): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(parts.join(":"));
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
    // KV list with prefix to find matching keys
    const prefixes = [`ctx:${libraryId}:`];
    for (const prefix of prefixes) {
      const list = await env.CACHE.list({ prefix });
      for (const key of list.keys) {
        await env.CACHE.delete(key.name);
      }
    }
  } catch (e) {
    console.warn("Cache invalidation failed:", e);
  }
}
