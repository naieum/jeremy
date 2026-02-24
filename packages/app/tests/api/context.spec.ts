import { test, expect } from "../fixtures/base";

test.describe("Context - /api/context", () => {
  test("401 without API key", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const res = await ctx.get(
        "/api/context?libraryId=test-lib-1&query=getting+started"
      );
      expect(res.status()).toBe(401);
    } finally {
      await ctx.dispose();
    }
  });

  test("400 without libraryId or query", async ({ userClient }) => {
    // Missing both
    const res1 = await userClient.context({
      libraryId: "",
      query: "",
    });
    expect(res1.status()).toBe(400);
    const body1 = await res1.json();
    expect(body1.error).toContain("required");

    // Missing query (pass only libraryId via raw request)
    const res2 = await userClient.context({
      libraryId: "test-lib-1",
      query: "",
    });
    expect(res2.status()).toBe(400);
  });

  test("returns chunks for own library via D1 text search fallback (should have fallback: true)", async ({
    userClient,
  }) => {
    const res = await userClient.context({
      libraryId: "test-lib-1",
      query: "getting started install",
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.chunks).toBeDefined();
    expect(Array.isArray(body.chunks)).toBe(true);
    expect(body.chunks.length).toBeGreaterThanOrEqual(1);
    expect(body.libraryId).toBe("test-lib-1");
    expect(body.query).toBe("getting started install");
    // Local dev uses D1 fallback since Vectorize is not available
    expect(body.fallback).toBe(true);

    // Verify chunk shape
    const chunk = body.chunks[0];
    expect(chunk.id).toBeTruthy();
    expect(chunk.content).toBeTruthy();
  });

  test("respects topK parameter", async ({ userClient }) => {
    const res = await userClient.context({
      libraryId: "test-lib-1",
      query: "configuration options host port",
      topK: 1,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.chunks.length).toBeLessThanOrEqual(1);
  });

  test("token budget limits total returned content", async ({
    userClient,
  }) => {
    // The test library has chunks with tokenCount 20, 18, 12 = 50 total
    // Setting maxTokens to 25 should return only the first chunk or two (depending on sort order)
    const res = await userClient.context({
      libraryId: "test-lib-1",
      query: "getting started configuration api",
      maxTokens: 25,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.chunks).toBeDefined();

    // Calculate total tokens of returned chunks
    const totalTokens = body.chunks.reduce(
      (sum: number, c: any) => sum + (c.tokenCount ?? 0),
      0
    );
    expect(totalTokens).toBeLessThanOrEqual(25);
  });
});
