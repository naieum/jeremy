import { test, expect } from "../fixtures/base";
import { ApiClient } from "../helpers/api-client";

test.describe("Webhooks - /api/webhooks/github", () => {
  test("ignores non-push events (X-GitHub-Event: ping)", async ({
    playwright,
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const client = new ApiClient(ctx);
      const res = await client.githubWebhook("ping", {
        zen: "Anything added dilutes everything else.",
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ignored).toBe(true);
      expect(body.reason).toContain("ping");
    } finally {
      await ctx.dispose();
    }
  });

  test("returns { ignored } for repos without verified connection", async ({
    playwright,
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
    });
    try {
      const client = new ApiClient(ctx);
      const res = await client.githubWebhook("push", {
        ref: "refs/heads/main",
        repository: {
          full_name: "nonexistent-owner/nonexistent-repo",
          default_branch: "main",
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ignored).toBe(true);
      expect(body.reason).toContain("No verified connection");
    } finally {
      await ctx.dispose();
    }
  });
});
