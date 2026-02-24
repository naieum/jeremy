import { test, expect } from "../fixtures/base";
import * as fs from "fs";

import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadCookies(filename: string) {
  const filePath = path.resolve(__dirname, "..", ".auth", filename);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")).cookies;
}

test.describe("Auth guards", () => {
  test("Unauthenticated user visiting /dashboard is redirected to /login", async ({
    page,
  }) => {
    // Do NOT set cookies -- unauthenticated
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("Non-admin visiting /dashboard/admin is redirected to /dashboard", async ({
    page,
    context,
  }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/admin");

    // Non-admin should be redirected away from admin
    await page.waitForURL((url) => !url.pathname.includes("/admin"), {
      timeout: 10000,
    });
    expect(page.url()).not.toContain("/admin");
  });

  test("Non-admin visiting /dashboard/chat is redirected to /dashboard", async ({
    page,
    context,
  }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/chat");

    // Non-admin should be redirected away from chat
    await page.waitForURL((url) => !url.pathname.includes("/chat"), {
      timeout: 10000,
    });
    expect(page.url()).not.toContain("/chat");
  });

  test("Admin can access /dashboard/admin", async ({ page, context }) => {
    const cookies = loadCookies("admin.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/admin");

    // Admin should stay on the admin page and see the admin heading
    await expect(page.locator("h1")).toHaveText("Admin", { timeout: 10000 });
    expect(page.url()).toContain("/admin");
  });

  test("Admin can access /dashboard/chat", async ({ page, context }) => {
    const cookies = loadCookies("admin.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/chat");

    // Admin should stay on the chat page and see the chat heading
    await expect(page.locator("h1")).toHaveText("Chat", { timeout: 10000 });
    expect(page.url()).toContain("/chat");
  });
});
