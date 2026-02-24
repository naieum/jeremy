import { test, expect } from "../fixtures/base";

test.describe("Auth - API key and session authentication", () => {
  test("401 without any auth (GET /api/search without Bearer header)", async ({
    playwright,
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const res = await ctx.get("/api/search?libraryName=test-library");
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    } finally {
      await ctx.dispose();
    }
  });

  test("401 with invalid API key format", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const res = await ctx.get("/api/search?libraryName=test-library", {
        headers: { Authorization: "Bearer not-a-valid-key-format" },
      });
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    } finally {
      await ctx.dispose();
    }
  });

  test("401 with non-existent API key (valid format but not in DB)", async ({
    playwright,
  }) => {
    // jrmy_ prefix + 64 hex chars
    const fakeKey =
      "jrmy_" + "a".repeat(64);
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const res = await ctx.get("/api/search?libraryName=test-library", {
        headers: { Authorization: `Bearer ${fakeKey}` },
      });
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    } finally {
      await ctx.dispose();
    }
  });

  test("valid API key returns data", async ({ userClient }) => {
    const res = await userClient.search({ libraryName: "test-library" });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.libraries).toBeDefined();
    expect(Array.isArray(body.libraries)).toBe(true);
  });

  test("session cookie auth works for /api/keys", async ({ userClient }) => {
    const res = await userClient.listKeys();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.keys).toBeDefined();
    expect(Array.isArray(body.keys)).toBe(true);
  });

  test("read key cannot access admin-only endpoints (POST /api/ingest requires admin key)", async ({
    playwright,
    userApiKey,
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      // Use only API key auth (no session cookies) with a read-only key
      const res = await ctx.post("/api/ingest", {
        headers: { Authorization: `Bearer ${userApiKey}` },
        data: {
          libraryId: "should-not-work",
          name: "should-not-work",
          chunks: [{ id: "c1", content: "test" }],
        },
      });
      // The ingest endpoint requires admin API key or session auth.
      // A read API key alone should result in 401 since validateApiKey("admin") returns null
      // and there's no session cookie either.
      expect(res.status()).toBe(401);
    } finally {
      await ctx.dispose();
    }
  });
});
