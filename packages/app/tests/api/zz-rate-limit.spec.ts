import { test, expect } from "../fixtures/base";

test.describe("Rate Limiting - /api/search", () => {
  test.slow();

  test("after 60+ rapid requests to /api/search, returns 429 with Retry-After header", async ({
    userClient,
  }) => {
    // The rate limit is 60 requests per minute per key for the "read" endpoint.
    // Send requests until we get a 429 or exhaust our attempts.
    let got429 = false;
    let retryAfterHeader: string | null = null;
    const maxRequests = 75; // a few more than the limit to ensure we hit it

    for (let i = 0; i < maxRequests; i++) {
      const res = await userClient.search({ libraryName: "test-library" });
      if (res.status() === 429) {
        got429 = true;
        retryAfterHeader = res.headers()["retry-after"] ?? null;
        break;
      }
      // If still 200, continue sending
      expect(res.status()).toBe(200);
    }

    expect(got429).toBe(true);
    expect(retryAfterHeader).toBeTruthy();
    // Retry-After should be a positive number of seconds
    const retryAfterSeconds = parseInt(retryAfterHeader!, 10);
    expect(retryAfterSeconds).toBeGreaterThan(0);
    expect(retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
