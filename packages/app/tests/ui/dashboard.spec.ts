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

test.describe("Dashboard", () => {
  test("Shows stat/summary content", async ({ page, context }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard");

    await expect(page.locator("h1")).toHaveText("Dashboard", { timeout: 10000 });
    // Stat cards should show Libraries, Doc Chunks, and API Keys labels
    const statCards = page.locator(".grid");
    await expect(statCards.getByText("Libraries")).toBeVisible();
    await expect(statCards.getByText("Doc Chunks")).toBeVisible();
    await expect(statCards.getByText("API Keys")).toBeVisible();
  });

  test("Nav shows Libraries, API Keys, Settings links", async ({
    page,
    context,
  }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toHaveText("Dashboard", { timeout: 10000 });

    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: "Libraries" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "API Keys" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("Non-admin nav hides Admin and Chat links", async ({
    page,
    context,
  }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toHaveText("Dashboard", { timeout: 10000 });

    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: "Admin" })).not.toBeVisible();
    await expect(nav.getByRole("link", { name: "Chat" })).not.toBeVisible();
  });

  test("Admin nav shows Admin and Chat links", async ({ page, context }) => {
    const cookies = loadCookies("admin.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toHaveText("Dashboard", { timeout: 10000 });

    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: "Admin" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Chat" })).toBeVisible();
  });
});
