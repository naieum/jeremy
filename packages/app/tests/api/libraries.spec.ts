import { test, expect } from "../fixtures/base";

test.describe("Libraries - list, get, delete", () => {
  test("GET /api/libraries/ returns only user's libraries", async ({
    userClient,
  }) => {
    const res = await userClient.listLibraries();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.libraries).toBeDefined();
    expect(Array.isArray(body.libraries)).toBe(true);
    // The test user owns test-lib-1
    const testLib = body.libraries.find((l: any) => l.id === "test-lib-1");
    expect(testLib).toBeTruthy();
    expect(testLib.name).toBe("test-library");
    // Should NOT include other user's libraries
    const otherLib = body.libraries.find(
      (l: any) => l.id === "public-lib-1" || l.id === "private-lib-1"
    );
    expect(otherLib).toBeUndefined();
  });

  test("GET /api/libraries/$id returns library + paginated chunks", async ({
    userClient,
  }) => {
    const res = await userClient.getLibrary("test-lib-1");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.library).toBeDefined();
    expect(body.library.id).toBe("test-lib-1");
    expect(body.library.name).toBe("test-library");
    expect(body.chunks).toBeDefined();
    expect(Array.isArray(body.chunks)).toBe(true);
    expect(body.chunks.length).toBe(3);
    expect(body.total).toBe(3);
    expect(body.hasMore).toBe(false);
  });

  test("GET /api/libraries/$id limit/offset work, returns total + hasMore", async ({
    userClient,
  }) => {
    // Fetch with limit=1, offset=0
    const res1 = await userClient.getLibrary("test-lib-1", {
      limit: 1,
      offset: 0,
    });
    expect(res1.status()).toBe(200);
    const body1 = await res1.json();
    expect(body1.chunks.length).toBe(1);
    expect(body1.total).toBe(3);
    expect(body1.hasMore).toBe(true);

    // Fetch with limit=1, offset=2
    const res2 = await userClient.getLibrary("test-lib-1", {
      limit: 1,
      offset: 2,
    });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.chunks.length).toBe(1);
    expect(body2.total).toBe(3);
    expect(body2.hasMore).toBe(false);
  });

  test("GET /api/libraries/$id returns other user's public library", async ({
    userClient,
  }) => {
    const res = await userClient.getLibrary("public-lib-1");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.library.id).toBe("public-lib-1");
    expect(body.library.isPublic).toBe(1);
  });

  test("GET /api/libraries/$id 404 for other user's private library", async ({
    userClient,
  }) => {
    const res = await userClient.getLibrary("private-lib-1");
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("DELETE /api/libraries/$id removes library and chunks", async ({
    adminClient,
  }) => {
    // Use admin client (admin API key) to create library — separate rate limit bucket
    const libId = `delete-test-lib-${Date.now()}`;
    const ingestRes = await adminClient.ingest({
      libraryId: libId,
      name: "delete-test-library",
      description: "Will be deleted",
      chunks: [
        { id: `${libId}:c1`, content: "chunk to delete", tokenCount: 5 },
      ],
      skipEmbeddings: true,
    });
    expect(ingestRes.status()).toBe(200);

    // Verify it exists
    const getRes = await adminClient.getLibrary(libId);
    expect(getRes.status()).toBe(200);

    // Delete it
    const deleteRes = await adminClient.deleteLibrary(libId);
    expect(deleteRes.status()).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.success).toBe(true);

    // Verify it's gone
    const getRes2 = await adminClient.getLibrary(libId);
    expect(getRes2.status()).toBe(404);
  });

  test("DELETE /api/libraries/$id 404 for other user's library", async ({
    userClient,
  }) => {
    const res = await userClient.deleteLibrary("public-lib-1");
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
