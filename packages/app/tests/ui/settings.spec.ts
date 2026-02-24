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

test.describe("Settings", () => {
  test("Shows user profile info", async ({ page, context }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/settings");

    await expect(page.locator("h1")).toHaveText("Settings", { timeout: 10000 });
    // The Profile section should show the test user's name and email
    await expect(page.getByText("Profile")).toBeVisible();
    await expect(page.getByRole("main").getByText("Test User")).toBeVisible();
    await expect(page.getByText("testuser@test.com")).toBeVisible();
  });

  test("Theme section visible", async ({ page, context }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/settings");

    await expect(page.locator("h1")).toHaveText("Settings", { timeout: 10000 });
    await expect(page.getByText("Appearance")).toBeVisible();
    // All four themes should be listed
    await expect(page.getByText("Blue (Dark)")).toBeVisible();
    await expect(page.getByText("Blue (Light)")).toBeVisible();
    await expect(page.getByText("Cream (Light)")).toBeVisible();
    await expect(page.getByText("Cream (Dark)")).toBeVisible();
  });

  test("MCP config section visible", async ({ page, context }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/settings");

    await expect(page.locator("h1")).toHaveText("Settings", { timeout: 10000 });
    await expect(page.getByText("MCP Configuration")).toBeVisible();
    await expect(page.getByText("claude mcp add", { exact: false })).toBeVisible();
  });
});
