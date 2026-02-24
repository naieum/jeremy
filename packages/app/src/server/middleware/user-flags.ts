import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq } from "drizzle-orm";
import { getCached, setCache } from "../lib/cache";

const BAN_CACHE_TTL = 300; // 5 minutes

export async function checkUserBanned(userId: string): Promise<{ banned: boolean; reason?: string }> {
  const cacheKey = `ban:${userId}`;

  // Check cache first
  const cached = await getCached<{ banned: boolean; reason?: string }>(cacheKey);
  if (cached !== null) return cached;

  const db = createDb(env.DB);
  const [flag] = await db
    .select()
    .from(schema.userFlags)
    .where(eq(schema.userFlags.userId, userId))
    .limit(1);

  // Look specifically for "banned" flag
  const banFlags = flag
    ? await db
        .select()
        .from(schema.userFlags)
        .where(eq(schema.userFlags.userId, userId))
    : [];

  const banFlag = banFlags.find((f) => f.flag === "banned");

  const result = banFlag
    ? { banned: true, reason: banFlag.reason ?? "Account banned" }
    : { banned: false };

  await setCache(cacheKey, result, BAN_CACHE_TTL);
  return result;
}

export function bannedResponse(reason: string): Response {
  return Response.json(
    { error: "Account banned", reason },
    { status: 403 }
  );
}
