import { test, expect } from "../fixtures/base";

test.describe("Doc Sites - /api/libraries/$id/docs", () => {
  test("GET returns { exists: false } when no site", async ({
    userClient,
  }) => {
    const res = await userClient.getDocSite("test-lib-1");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(false);
  });

  test("POST create 404 for non-owned library", async ({ userClient }) => {
    // public-lib-1 is owned by "other" user
    const res = await userClient.createDocSite("public-lib-1");
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("POST create 403 without verified repo connection", async ({
    userClient,
  }) => {
    // test-lib-1 is owned by user but has no repo connection
    const res = await userClient.createDocSite("test-lib-1");
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("verified repo connection");
  });

  test("DELETE 404 when no site exists", async ({ userClient }) => {
    const res = await userClient.deleteDocSite("test-lib-1");
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
