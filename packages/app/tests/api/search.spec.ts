import { test, expect } from "../fixtures/base";

test.describe("Search - /api/search", () => {
  test("401 without API key", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const res = await ctx.get("/api/search?libraryName=test-library");
      expect(res.status()).toBe(401);
    } finally {
      await ctx.dispose();
    }
  });

  test("returns own library by exact name (libraryName=test-library)", async ({
    userClient,
  }) => {
    const res = await userClient.search({ libraryName: "test-library" });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.libraries).toBeDefined();
    expect(body.libraries.length).toBeGreaterThanOrEqual(1);
    const lib = body.libraries.find((l: any) => l.id === "test-lib-1");
    expect(lib).toBeTruthy();
    expect(lib.name).toBe("test-library");
    expect(lib.chunkCount).toBe(3);
  });

  test("returns own library by exact ID (libraryName=test-lib-1)", async ({
    userClient,
  }) => {
    const res = await userClient.search({ libraryName: "test-lib-1" });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.libraries).toBeDefined();
    expect(body.libraries.length).toBeGreaterThanOrEqual(1);
    const lib = body.libraries.find((l: any) => l.id === "test-lib-1");
    expect(lib).toBeTruthy();
  });

  test("returns public library owned by other user", async ({
    userClient,
  }) => {
    const res = await userClient.search({ libraryName: "public-library" });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.libraries).toBeDefined();
    const pubLib = body.libraries.find((l: any) => l.id === "public-lib-1");
    expect(pubLib).toBeTruthy();
    expect(pubLib.name).toBe("public-library");
  });

  test("LIKE search finds partial name matches (libraryName=test)", async ({
    userClient,
  }) => {
    const res = await userClient.search({ libraryName: "test" });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.libraries).toBeDefined();
    // Should match test-library (by name LIKE %test%) or test-lib-1 (by id LIKE %test%)
    expect(body.libraries.length).toBeGreaterThanOrEqual(1);
  });

  test("empty results for non-matching query", async ({ userClient }) => {
    const res = await userClient.search({
      libraryName: "zzz-nonexistent-library-zzz",
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.libraries).toBeDefined();
    expect(body.libraries.length).toBe(0);
  });
});
