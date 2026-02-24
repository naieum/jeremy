import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq, and, count, desc } from "drizzle-orm";

export const VALID_CATEGORIES = [
  "framework",
  "library",
  "tool",
  "language",
  "platform",
  "database",
  "other",
] as const;

export type LibraryCategory = (typeof VALID_CATEGORIES)[number];

function isAdmin(userId: string): boolean {
  return userId === (env as any).ADMIN_USER_ID;
}

// GET /api/admin/users — list users (paginated)
export async function handleAdminListUsers(
  userId: string,
  request: Request
): Promise<Response> {
  if (!isAdmin(userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const db = createDb(env.DB);

  const users = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(schema.user);

  // Get library counts per user
  const usersWithStats = await Promise.all(
    users.map(async (u) => {
      const [libCount] = await db
        .select({ count: count() })
        .from(schema.libraries)
        .where(eq(schema.libraries.ownerId, u.id));

      const flags = await db
        .select({ flag: schema.userFlags.flag })
        .from(schema.userFlags)
        .where(eq(schema.userFlags.userId, u.id));

      return {
        ...u,
        libraryCount: libCount.count,
        flags: flags.map((f) => f.flag),
      };
    })
  );

  return Response.json({
    users: usersWithStats,
    total,
    hasMore: offset + users.length < total,
  });
}

// GET /api/admin/users/:id — user detail
export async function handleAdminGetUser(
  adminUserId: string,
  targetUserId: string
): Promise<Response> {
  if (!isAdmin(adminUserId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createDb(env.DB);

  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, targetUserId))
    .limit(1);

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const libraries = await db
    .select({
      id: schema.libraries.id,
      name: schema.libraries.name,
      chunkCount: schema.libraries.chunkCount,
      sourceType: schema.libraries.sourceType,
      updatedAt: schema.libraries.updatedAt,
    })
    .from(schema.libraries)
    .where(eq(schema.libraries.ownerId, targetUserId));

  const flags = await db
    .select()
    .from(schema.userFlags)
    .where(eq(schema.userFlags.userId, targetUserId));

  const connections = await db
    .select()
    .from(schema.repoConnections)
    .where(eq(schema.repoConnections.userId, targetUserId));

  const apiKeys = await db
    .select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      permissions: schema.apiKeys.permissions,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, targetUserId));

  return Response.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    },
    libraries,
    flags,
    repoConnections: connections,
    apiKeys,
  });
}

// POST /api/admin/users/:id/flags — set/remove flags
export async function handleAdminSetFlag(
  adminUserId: string,
  targetUserId: string,
  request: Request
): Promise<Response> {
  if (!isAdmin(adminUserId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    action: "add" | "remove";
    flag: string;
    reason?: string;
  };

  if (!body.action || !body.flag) {
    return Response.json(
      { error: "action and flag are required" },
      { status: 400 }
    );
  }

  const validFlags = ["banned", "warned", "verified", "suspended"];
  if (!validFlags.includes(body.flag)) {
    return Response.json(
      { error: `Invalid flag. Must be one of: ${validFlags.join(", ")}` },
      { status: 400 }
    );
  }

  const db = createDb(env.DB);

  // Verify target user exists
  const [targetUser] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, targetUserId))
    .limit(1);

  if (!targetUser) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (body.action === "add") {
    await db.insert(schema.userFlags).values({
      id: crypto.randomUUID(),
      userId: targetUserId,
      flag: body.flag,
      reason: body.reason ?? null,
      createdBy: adminUserId,
    });

    // Invalidate ban cache if banning
    if (body.flag === "banned") {
      try {
        await env.CACHE.delete(`ban:${targetUserId}`);
      } catch {}
    }

    return Response.json({ success: true, action: "added", flag: body.flag });
  }

  if (body.action === "remove") {
    // Find and delete the flag
    const flags = await db
      .select()
      .from(schema.userFlags)
      .where(eq(schema.userFlags.userId, targetUserId));

    const flagToRemove = flags.find((f) => f.flag === body.flag);
    if (!flagToRemove) {
      return Response.json({ error: "Flag not found" }, { status: 404 });
    }

    await db
      .delete(schema.userFlags)
      .where(eq(schema.userFlags.id, flagToRemove.id));

    // Invalidate ban cache if unbanning
    if (body.flag === "banned") {
      try {
        await env.CACHE.delete(`ban:${targetUserId}`);
      } catch {}
    }

    return Response.json({ success: true, action: "removed", flag: body.flag });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

// GET /api/admin/libraries — list all libraries
export async function handleAdminListLibraries(
  userId: string
): Promise<Response> {
  if (!isAdmin(userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createDb(env.DB);

  const libs = await db
    .select({
      id: schema.libraries.id,
      name: schema.libraries.name,
      category: schema.libraries.category,
      chunkCount: schema.libraries.chunkCount,
      sourceType: schema.libraries.sourceType,
      updatedAt: schema.libraries.updatedAt,
    })
    .from(schema.libraries);

  return Response.json({ libraries: libs });
}

// PATCH /api/admin/libraries/:id/category — update library category
export async function handleAdminUpdateCategory(
  adminUserId: string,
  libraryId: string,
  request: Request
): Promise<Response> {
  if (!isAdmin(adminUserId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { category: string };

  if (!body.category || !VALID_CATEGORIES.includes(body.category as any)) {
    return Response.json(
      {
        error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const db = createDb(env.DB);

  const [library] = await db
    .select()
    .from(schema.libraries)
    .where(eq(schema.libraries.id, libraryId))
    .limit(1);

  if (!library) {
    return Response.json({ error: "Library not found" }, { status: 404 });
  }

  await db
    .update(schema.libraries)
    .set({ category: body.category, updatedAt: new Date().toISOString() })
    .where(eq(schema.libraries.id, libraryId));

  return Response.json({ success: true, category: body.category });
}

// POST /api/admin/libraries/:id/rebuild — admin rebuild (bypasses ownership)
export async function handleAdminRebuild(
  adminUserId: string,
  libraryId: string
): Promise<Response> {
  if (!isAdmin(adminUserId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createDb(env.DB);

  const [library] = await db
    .select()
    .from(schema.libraries)
    .where(eq(schema.libraries.id, libraryId))
    .limit(1);

  if (!library) {
    return Response.json({ error: "Library not found" }, { status: 404 });
  }

  // Find or create doc site for this library
  let [site] = await db
    .select()
    .from(schema.docSites)
    .where(eq(schema.docSites.libraryId, libraryId))
    .limit(1);

  if (!site) {
    // Create a doc site automatically for admin rebuilds
    const subdomain = library.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 63);

    const siteId = crypto.randomUUID();
    await db.insert(schema.docSites).values({
      id: siteId,
      libraryId,
      userId: adminUserId,
      subdomain,
      status: "pending",
    });

    [site] = await db
      .select()
      .from(schema.docSites)
      .where(eq(schema.docSites.id, siteId))
      .limit(1);
  }

  // Update status to building
  await db
    .update(schema.docSites)
    .set({ status: "building", buildError: null })
    .where(eq(schema.docSites.id, site.id));

  try {
    const ghToken = (env as any).GITHUB_ACTIONS_TOKEN;
    const ghRepo = (env as any).GITHUB_REPO ?? "jeremy";
    const ghOwner = (env as any).GITHUB_OWNER;

    if (ghToken && ghOwner) {
      await fetch(
        `https://api.github.com/repos/${ghOwner}/${ghRepo}/dispatches`,
        {
          method: "POST",
          headers: {
            "User-Agent": "Jeremy-App",
            Authorization: `token ${ghToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event_type: "build-docs",
            client_payload: {
              libraryId,
              subdomain: site.subdomain,
              siteId: site.id,
            },
          }),
        }
      );
    } else {
      const { generateAndUploadDocs } = await import("../lib/docs-generator");
      await generateAndUploadDocs(libraryId, site.subdomain);

      await db
        .update(schema.docSites)
        .set({
          status: "live",
          lastBuiltAt: new Date().toISOString(),
        })
        .where(eq(schema.docSites.id, site.id));

      return Response.json({
        status: "live",
        url: `https://${site.subdomain}.docs.jeremy.dev`,
      });
    }
  } catch (e: any) {
    await db
      .update(schema.docSites)
      .set({ status: "error", buildError: e.message })
      .where(eq(schema.docSites.id, site.id));

    return Response.json(
      { error: `Build trigger failed: ${e.message}` },
      { status: 500 }
    );
  }

  return Response.json({
    status: "building",
    url: `https://${site.subdomain}.docs.jeremy.dev`,
  });
}
