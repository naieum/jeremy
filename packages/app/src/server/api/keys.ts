import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { generateApiKey, hashKey } from "../middleware/api-auth";

export async function handleListKeys(userId: string): Promise<Response> {
  const db = createDb(env.DB);
  const keys = await db
    .select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      permissions: schema.apiKeys.permissions,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, userId));

  return Response.json({ keys });
}

export async function handleCreateKey(
  userId: string,
  request: Request
): Promise<Response> {
  const body = (await request.json()) as {
    name: string;
    permissions?: string;
  };

  if (!body.name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const rawKey = generateApiKey();
  const keyHashValue = await hashKey(rawKey);
  const keyId = crypto.randomUUID();

  const db = createDb(env.DB);
  await db.insert(schema.apiKeys).values({
    id: keyId,
    userId,
    name: body.name,
    keyHash: keyHashValue,
    keyPrefix: rawKey.slice(0, 12),
    permissions:
      body.permissions === "admin" && userId === env.ADMIN_USER_ID
        ? "admin"
        : "read",
  });

  const granted =
    body.permissions === "admin" && userId === env.ADMIN_USER_ID
      ? "admin"
      : "read";

  // Return the raw key only once — never stored
  return Response.json({
    id: keyId,
    name: body.name,
    key: rawKey,
    keyPrefix: rawKey.slice(0, 12),
    permissions: granted,
  });
}

export async function handleDeleteKey(
  userId: string,
  keyId: string
): Promise<Response> {
  const db = createDb(env.DB);

  const [key] = await db
    .select()
    .from(schema.apiKeys)
    .where(
      and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.userId, userId))
    )
    .limit(1);

  if (!key) {
    return Response.json({ error: "Key not found" }, { status: 404 });
  }

  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, keyId));
  return Response.json({ success: true });
}
