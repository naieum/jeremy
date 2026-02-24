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

test.describe("Libraries", () => {
  test("Library list shows seeded libraries", async ({ page, context }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/libraries");

    await expect(page.locator("h1")).toHaveText("Libraries", { timeout: 10000 });
    // The test setup seeds at least "test-library"
    await expect(page.getByText("test-library")).toBeVisible({ timeout: 10000 });
  });

  test("'Add Library' button exists", async ({ page, context }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/libraries");

    await expect(page.locator("h1")).toHaveText("Libraries", { timeout: 10000 });
    const addButton = page.getByRole("link", { name: "Add Library" });
    await expect(addButton).toBeVisible();
  });

  test("Library detail page accessible for owned library", async ({
    page,
    context,
  }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/libraries");
    await expect(page.locator("h1")).toHaveText("Libraries", { timeout: 10000 });

    // Navigate to the test-library detail page
    await page.goto("/dashboard/libraries/test-lib-1");

    // The detail page should show the library name and chunk information
    await expect(page.getByText("test-library")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Chunks/ })).toBeVisible();
  });
});
