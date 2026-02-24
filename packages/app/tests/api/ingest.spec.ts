import { test, expect } from "../fixtures/base";

test.describe("Ingest - /api/ingest", () => {
  test("401 without auth", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const res = await ctx.post("/api/ingest", {
        data: {
          libraryId: "no-auth-lib",
          name: "no-auth",
          chunks: [{ id: "c1", content: "test" }],
        },
      });
      expect(res.status()).toBe(401);
    } finally {
      await ctx.dispose();
    }
  });

  test("400 missing required fields (libraryId, name, chunks)", async ({
    userClient,
  }) => {
    // Missing libraryId
    const res1 = await userClient.ingest({
      name: "test",
      chunks: [{ id: "c1", content: "test" }],
    });
    expect(res1.status()).toBe(400);

    // Missing name
    const res2 = await userClient.ingest({
      libraryId: "test",
      chunks: [{ id: "c1", content: "test" }],
    });
    expect(res2.status()).toBe(400);

    // Missing chunks
    const res3 = await userClient.ingest({
      libraryId: "test",
      name: "test",
    });
    expect(res3.status()).toBe(400);

    // Empty chunks array
    const res4 = await userClient.ingest({
      libraryId: "test",
      name: "test",
      chunks: [],
    });
    expect(res4.status()).toBe(400);
  });

  test("creates new library with chunks (admin API key)", async ({
    adminClient,
    adminUserId,
  }) => {
    const libId = `ingest-admin-key-${Date.now()}`;
    const res = await adminClient.ingest({
      libraryId: libId,
      name: `admin-ingest-test-${Date.now()}`,
      description: "Created via admin API key",
      chunks: [
        { id: `${libId}:c1`, content: "Admin chunk 1", tokenCount: 5 },
        { id: `${libId}:c2`, content: "Admin chunk 2", tokenCount: 5 },
      ],
      skipEmbeddings: true,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.libraryId).toBe(libId);
    expect(body.chunksIngested).toBe(2);

    // Clean up
    await adminClient.deleteLibrary(libId);
  });

  test("creates via session auth", async ({ userClient }) => {
    const libId = `ingest-session-${Date.now()}`;
    const res = await userClient.ingest({
      libraryId: libId,
      name: `session-ingest-test-${Date.now()}`,
      description: "Created via session auth",
      chunks: [
        { id: `${libId}:c1`, content: "Session chunk 1", tokenCount: 5 },
      ],
      skipEmbeddings: true,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.libraryId).toBe(libId);
    expect(body.chunksIngested).toBe(1);

    // Clean up
    await userClient.deleteLibrary(libId);
  });

  test("403 when ingesting into other user's library", async ({
    userClient,
  }) => {
    // public-lib-1 is owned by the "other" user
    const res = await userClient.ingest({
      libraryId: "public-lib-1",
      name: "public-library",
      chunks: [
        {
          id: "public-lib-1:hijack",
          content: "This should not be allowed",
          tokenCount: 5,
        },
      ],
      skipEmbeddings: true,
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("own");
  });

  test("replace: true deletes old chunks first", async ({ userClient }) => {
    const libId = `ingest-replace-${Date.now()}`;

    // Create initial library
    const res1 = await userClient.ingest({
      libraryId: libId,
      name: `replace-test-${Date.now()}`,
      chunks: [
        { id: `${libId}:old1`, content: "Old chunk 1", tokenCount: 5 },
        { id: `${libId}:old2`, content: "Old chunk 2", tokenCount: 5 },
      ],
      skipEmbeddings: true,
    });
    expect(res1.status()).toBe(200);

    // Replace with new chunks
    const res2 = await userClient.ingest({
      libraryId: libId,
      name: `replace-test-${Date.now()}`,
      chunks: [
        { id: `${libId}:new1`, content: "New chunk 1", tokenCount: 5 },
      ],
      replace: true,
      skipEmbeddings: true,
    });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.chunksIngested).toBe(1);

    // Verify only the new chunk exists
    const getRes = await userClient.getLibrary(libId);
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.total).toBe(1);
    expect(getBody.chunks[0].id).toBe(`${libId}:new1`);

    // Clean up
    await userClient.deleteLibrary(libId);
  });

  test("skipEmbeddings: true skips vectorization", async ({ userClient }) => {
    const libId = `ingest-skip-embed-${Date.now()}`;
    const res = await userClient.ingest({
      libraryId: libId,
      name: `skip-embed-test-${Date.now()}`,
      chunks: [
        { id: `${libId}:c1`, content: "No embeddings chunk", tokenCount: 5 },
      ],
      skipEmbeddings: true,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // When skipEmbeddings is true, vectorized should be false
    expect(body.vectorized).toBe(false);

    // Clean up
    await userClient.deleteLibrary(libId);
  });
});
