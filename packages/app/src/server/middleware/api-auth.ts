import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq } from "drizzle-orm";
import { getCached, setCache } from "../lib/cache";

export async function validateApiKey(
  request: Request,
  requiredPermission: "read" | "admin" = "read"
): Promise<{ userId: string; keyId: string } | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const key = authHeader.slice(7);
  const keyHash = await hashKey(key);

  // Check KV cache first
  const cacheKey = `auth:${keyHash.slice(0, 16)}`;
  const cached = await getCached<{ userId: string; keyId: string; permissions: string }>(cacheKey);
  if (cached) {
    if (requiredPermission === "admin" && cached.permissions !== "admin") return null;
    return { userId: cached.userId, keyId: cached.keyId };
  }

  const db = createDb(env.DB);

  const [apiKey] = await db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyHash, keyHash))
    .limit(1);

  if (!apiKey) return null;

  if (
    requiredPermission === "admin" &&
    apiKey.permissions !== "admin"
  ) {
    return null;
  }

  // Cache the auth result
  await setCache(cacheKey, { userId: apiKey.userId, keyId: apiKey.id, permissions: apiKey.permissions }, 300);

  // Update last used timestamp (throttled to once per hour)
  const ONE_HOUR_MS = 3600_000;
  const lastUsed = apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).getTime() : 0;
  if (Date.now() - lastUsed > ONE_HOUR_MS) {
    await db
      .update(schema.apiKeys)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(schema.apiKeys.id, apiKey.id));
  }

  return { userId: apiKey.userId, keyId: apiKey.id };
}

export async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `jrmy_${key}`;
}
