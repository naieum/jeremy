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

test.describe("Admin panel", () => {
  test("Admin panel shows user table", async ({ page, context }) => {
    const cookies = loadCookies("admin.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/admin");

    await expect(page.locator("h1")).toHaveText("Admin", { timeout: 10000 });

    // The table should have header columns
    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 10000 });
    await expect(table.getByText("Name")).toBeVisible();
    await expect(table.getByText("Email")).toBeVisible();

    // At least the seeded users should appear in the table
    await expect(page.getByText("admin@test.com")).toBeVisible();
    await expect(page.getByText("testuser@test.com")).toBeVisible();
  });

  test("User rows are clickable and linked to detail pages", async ({
    page,
    context,
  }) => {
    const cookies = loadCookies("admin.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/admin");

    await expect(page.locator("h1")).toHaveText("Admin", { timeout: 10000 });

    // The table should be visible with user rows
    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 10000 });

    // User names are rendered as links to their detail pages
    const userLink = table.getByRole("link", { name: "Test User", exact: true });
    await expect(userLink).toBeVisible();
    await expect(userLink).toHaveAttribute(
      "href",
      /\/dashboard\/admin\/users\//
    );

    // Click through to a user detail page
    await userLink.click();
    await page.waitForURL("**/dashboard/admin/users/**", { timeout: 10000 });

    // The detail page should show the user's name and a Flags section
    await expect(page.getByRole("main").getByText("Test User", { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Flags")).toBeVisible();
  });
});
