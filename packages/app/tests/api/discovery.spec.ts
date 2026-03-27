import { test, expect } from "../fixtures/base";
import { ApiClient } from "../helpers/api-client";
import { CRON_SECRET } from "../helpers/constants";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("Discovery - /api/admin/discovery", () => {
  // --- Sources CRUD ---

  test("GET /api/admin/discovery/sources 401 without auth", async ({
    playwright,
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const res = await ctx.get("/api/admin/discovery/sources");
      expect(res.status()).toBe(401);
    } finally {
      await ctx.dispose();
    }
  });

  test("GET /api/admin/discovery/sources 403 for non-admin", async ({
    userClient,
  }) => {
    const res = await userClient.discoveryListSources();
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");
  });

  test("GET /api/admin/discovery/sources returns pre-seeded sources", async ({
    adminClient,
  }) => {
    const res = await adminClient.discoveryListSources();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.sources).toBeDefined();
    expect(Array.isArray(body.sources)).toBe(true);
    // The migration pre-seeds 5 sources
    expect(body.sources.length).toBeGreaterThanOrEqual(5);

    const sourceIds = body.sources.map((s: any) => s.id);
    expect(sourceIds).toContain("npm-top-100");
    expect(sourceIds).toContain("pypi-top-100");
    expect(sourceIds).toContain("cratesio-top-50");
    expect(sourceIds).toContain("github-js");
    expect(sourceIds).toContain("github-ml");
  });

  test("POST /api/admin/discovery/sources creates a custom source", async ({
    adminClient,
  }) => {
    const res = await adminClient.discoveryAddSource({
      type: "rss",
      name: "Test RSS Feed",
      config: JSON.stringify({ feedUrl: "https://example.com/feed.xml" }),
      schedule: "daily",
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeTruthy();

    // Verify it appears in the list
    const listRes = await adminClient.discoveryListSources();
    const listBody = await listRes.json();
    const found = listBody.sources.find((s: any) => s.name === "Test RSS Feed");
    expect(found).toBeTruthy();
    expect(found.type).toBe("rss");
    expect(found.schedule).toBe("daily");

    // Clean up
    await adminClient.discoveryDeleteSource(found.id);
  });

  test("POST /api/admin/discovery/sources 400 for invalid type", async ({
    adminClient,
  }) => {
    const res = await adminClient.discoveryAddSource({
      type: "invalid_type",
      name: "Bad Source",
      config: "{}",
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid type");
  });

  test("PATCH /api/admin/discovery/sources/:id toggles enabled", async ({
    adminClient,
  }) => {
    // Disable npm-top-100
    const res = await adminClient.discoveryUpdateSource("npm-top-100", {
      enabled: 0,
    });
    expect(res.status()).toBe(200);

    // Verify it's disabled
    const listRes = await adminClient.discoveryListSources();
    const listBody = await listRes.json();
    const npm = listBody.sources.find((s: any) => s.id === "npm-top-100");
    expect(npm.enabled).toBe(0);

    // Re-enable
    await adminClient.discoveryUpdateSource("npm-top-100", { enabled: 1 });

    // Verify it's enabled again
    const listRes2 = await adminClient.discoveryListSources();
    const listBody2 = await listRes2.json();
    const npm2 = listBody2.sources.find((s: any) => s.id === "npm-top-100");
    expect(npm2.enabled).toBe(1);
  });

  test("PATCH /api/admin/discovery/sources/:id 404 for non-existent", async ({
    adminClient,
  }) => {
    const res = await adminClient.discoveryUpdateSource("nonexistent-source", {
      enabled: 0,
    });
    expect(res.status()).toBe(404);
  });

  test("DELETE /api/admin/discovery/sources/:id removes source", async ({
    adminClient,
  }) => {
    // Create a source to delete
    const addRes = await adminClient.discoveryAddSource({
      type: "custom_url",
      name: "Deletable Source",
      config: JSON.stringify({ url: "https://example.com" }),
    });
    const addBody = await addRes.json();
    expect(addBody.success).toBe(true);

    // Delete it
    const delRes = await adminClient.discoveryDeleteSource(addBody.id);
    expect(delRes.status()).toBe(200);

    // Verify it's gone
    const listRes = await adminClient.discoveryListSources();
    const listBody = await listRes.json();
    const found = listBody.sources.find((s: any) => s.id === addBody.id);
    expect(found).toBeUndefined();
  });

  test("DELETE /api/admin/discovery/sources/:id 404 for non-existent", async ({
    adminClient,
  }) => {
    const res = await adminClient.discoveryDeleteSource("nonexistent-source");
    expect(res.status()).toBe(404);
  });

  // --- Queue ---

  test("GET /api/admin/discovery/queue returns counts", async ({
    adminClient,
  }) => {
    const res = await adminClient.discoveryListQueue();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.counts).toBeDefined();
    expect(typeof body.counts.pending).toBe("number");
    expect(typeof body.counts.done).toBe("number");
    expect(typeof body.counts.skipped).toBe("number");
    expect(typeof body.counts.error).toBe("number");
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("GET /api/admin/discovery/queue 403 for non-admin", async ({
    userClient,
  }) => {
    const res = await userClient.discoveryListQueue();
    expect(res.status()).toBe(403);
  });
});

test.describe("Discovery Cron - /api/cron/discovery", () => {
  test("401 without Authorization header", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const res = await ctx.post("/api/cron/discovery");
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    } finally {
      await ctx.dispose();
    }
  });

  test("401 with wrong CRON_SECRET", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const client = new ApiClient(ctx);
      const res = await client.cronDiscovery("wrong-secret-value");
      expect(res.status()).toBe(401);
    } finally {
      await ctx.dispose();
    }
  });

  test("processes with correct CRON_SECRET (all sources disabled)", async ({
    adminClient,
    playwright,
  }) => {
    // Queue processing can be slow due to doc probing, so extend timeout
    test.setTimeout(180_000);

    // Disable all sources first so the cron doesn't hit external APIs
    const sourceIds = [
      "npm-top-100",
      "pypi-top-100",
      "cratesio-top-50",
      "github-js",
      "github-ml",
    ];
    for (const id of sourceIds) {
      const res = await adminClient.discoveryUpdateSource(id, { enabled: 0 });
      expect(res.status()).toBe(200);
    }

    // Now trigger cron with no enabled sources — should be fast
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
      timeout: 180_000,
    });
    try {
      const client = new ApiClient(ctx);
      const res = await client.cronDiscovery(CRON_SECRET);
      expect(res.status()).toBe(200);
      const body = await res.json();
      // Source discovery should be 0 since we disabled them all
      expect(body.sourcesRun).toBe(0);
      expect(body.newItems).toBe(0);
      // Queue processing may still process items from prior runs
      expect(typeof body.probed).toBe("number");
      expect(typeof body.ingested).toBe("number");
    } finally {
      await ctx.dispose();
    }

    // Re-enable all sources
    for (const id of sourceIds) {
      await adminClient.discoveryUpdateSource(id, { enabled: 1 });
    }
  });
});
