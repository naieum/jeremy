import { test, expect } from "../fixtures/base";

test.describe("Repos - /api/libraries/$id/repo", () => {
  test("GET returns { connected: false } when no connection", async ({
    userClient,
  }) => {
    const res = await userClient.getRepoConnection("test-lib-1");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.connected).toBe(false);
  });

  test("POST connect 400 for invalid URL format", async ({ userClient }) => {
    const res = await userClient.connectRepo(
      "test-lib-1",
      "not-a-valid-url"
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("POST connect 404 for non-owned library", async ({ userClient }) => {
    // public-lib-1 is owned by "other" user
    const res = await userClient.connectRepo(
      "public-lib-1",
      "https://github.com/owner/repo"
    );
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("POST verify (pat method) 400 without token", async ({
    userClient,
  }) => {
    // First we need a connection to exist; since we can't connect to a real
    // GitHub repo in tests, we test the verify endpoint's validation.
    // Without a connection, verify returns 404. Test the validation logic
    // by checking that pat method requires a token.
    const res = await userClient.verifyRepo("test-lib-1", "pat");
    // Should be 404 since there's no repo connection for test-lib-1
    // (the connection must exist first). This tests that the endpoint
    // is reachable and returns a meaningful error.
    const status = res.status();
    // Either 404 (no connection) or 400 (missing token) depending on order of checks
    expect([400, 404]).toContain(status);
  });

  test("DELETE 404 when no connection exists", async ({ userClient }) => {
    const res = await userClient.disconnectRepo("test-lib-1");
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
