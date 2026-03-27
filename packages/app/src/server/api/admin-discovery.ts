import { env } from "cloudflare:workers";
import { eq, count, desc } from "drizzle-orm";
import { createDb, schema } from "../db";
import {
  runDiscoverySources,
  processDiscoveryQueue,
} from "../lib/discovery/runner";

function isAdmin(userId: string): boolean {
  return userId === (env as any).ADMIN_USER_ID;
}

// GET /api/admin/discovery/sources — list all discovery sources
export async function handleListSources(
  adminUserId: string
): Promise<Response> {
  if (!isAdmin(adminUserId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createDb(env.DB);
  const sources = await db.select().from(schema.discoverySources);

  return Response.json({ sources });
}

// PATCH /api/admin/discovery/sources/:id — update source (enable/disable, config)
export async function handleUpdateSource(
  adminUserId: string,
  sourceId: string,
  request: Request
): Promise<Response> {
  if (!isAdmin(adminUserId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createDb(env.DB);
  const body = (await request.json()) as {
    enabled?: number;
    config?: string;
    schedule?: string;
    name?: string;
  };

  const [source] = await db
    .select()
    .from(schema.discoverySources)
    .where(eq(schema.discoverySources.id, sourceId))
    .limit(1);

  if (!source) {
    return Response.json({ error: "Source not found" }, { status: 404 });
  }

  const updates: Record<string, any> = {};
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.config !== undefined) updates.config = body.config;
  if (body.schedule !== undefined) updates.schedule = body.schedule;
  if (body.name !== undefined) updates.name = body.name;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No updates provided" }, { status: 400 });
  }

  await db
    .update(schema.discoverySources)
    .set(updates)
    .where(eq(schema.discoverySources.id, sourceId));

  return Response.json({ success: true });
}

// POST /api/admin/discovery/sources — add a new custom source
export async function handleAddSource(
  adminUserId: string,
  request: Request
): Promise<Response> {
  if (!isAdmin(adminUserId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    id?: string;
    type: string;
    name: string;
    config: string;
    schedule?: string;
  };

  if (!body.type || !body.name) {
    return Response.json(
      { error: "type and name are required" },
      { status: 400 }
    );
  }

  const validTypes = [
    "npm_registry",
    "pypi",
    "cratesio",
    "github_search",
    "rss",
    "custom_url",
  ];
  if (!validTypes.includes(body.type)) {
    return Response.json(
      { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  const db = createDb(env.DB);

  const id =
    body.id ||
    body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  await db.insert(schema.discoverySources).values({
    id,
    type: body.type,
    name: body.name,
    config: body.config || "{}",
    schedule: body.schedule || "weekly",
  });

  return Response.json({ success: true, id });
}

// DELETE /api/admin/discovery/sources/:id — delete a source
export async function handleDeleteSource(
  adminUserId: string,
  sourceId: string
): Promise<Response> {
  if (!isAdmin(adminUserId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createDb(env.DB);

  const [source] = await db
    .select()
    .from(schema.discoverySources)
    .where(eq(schema.discoverySources.id, sourceId))
    .limit(1);

  if (!source) {
    return Response.json({ error: "Source not found" }, { status: 404 });
  }

  await db
    .delete(schema.discoverySources)
    .where(eq(schema.discoverySources.id, sourceId));

  return Response.json({ success: true });
}

// POST /api/admin/discovery/run — manually trigger discovery
export async function handleRunDiscovery(
  adminUserId: string
): Promise<Response> {
  if (!isAdmin(adminUserId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const sourceResult = await runDiscoverySources();
    const queueResult = await processDiscoveryQueue({
      adminUserId,
      maxLlmsIngest: 5,
      maxCrawl: 1,
    });

    return Response.json({
      ...sourceResult,
      ...queueResult,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/admin/discovery/queue — paginated queue view
export async function handleListQueue(
  adminUserId: string,
  request: Request
): Promise<Response> {
  if (!isAdmin(adminUserId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const sourceId = url.searchParams.get("sourceId");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50"),
    200
  );
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const db = createDb(env.DB);

  // Build where conditions
  const conditions = [];
  if (status) {
    conditions.push(eq(schema.discoveryQueue.status, status));
  }
  if (sourceId) {
    conditions.push(eq(schema.discoveryQueue.sourceId, sourceId));
  }

  let query = db.select().from(schema.discoveryQueue);
  if (conditions.length === 1) {
    query = query.where(conditions[0]) as any;
  } else if (conditions.length > 1) {
    const { and } = await import("drizzle-orm");
    query = query.where(and(...conditions)) as any;
  }

  const items = await query.limit(limit).offset(offset);

  // Get status counts
  const allItems = await db.select().from(schema.discoveryQueue);
  const counts = {
    pending: 0,
    done: 0,
    skipped: 0,
    error: 0,
  };
  for (const item of allItems) {
    if (item.status in counts) {
      counts[item.status as keyof typeof counts]++;
    }
  }

  return Response.json({ items, counts, total: allItems.length });
}
