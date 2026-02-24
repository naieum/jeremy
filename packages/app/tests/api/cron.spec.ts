import { test, expect } from "../fixtures/base";
import { ApiClient } from "../helpers/api-client";
import { CRON_SECRET } from "../helpers/constants";

test.describe("Cron - /api/cron/refresh", () => {
  test("401 without Authorization header", async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const res = await ctx.post("/api/cron/refresh");
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
      const res = await client.cronRefresh("wrong-secret-value");
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    } finally {
      await ctx.dispose();
    }
  });

  test("processes with correct CRON_SECRET (may find 0 stale libs)", async ({
    playwright,
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const client = new ApiClient(ctx);
      const res = await client.cronRefresh(CRON_SECRET);
      expect(res.status()).toBe(200);
      const body = await res.json();
      // The response should include these fields even if nothing was stale
      expect(typeof body.refreshed).toBe("number");
      expect(typeof body.staleFound).toBe("number");
      expect(Array.isArray(body.results)).toBe(true);
    } finally {
      await ctx.dispose();
    }
  });
});
