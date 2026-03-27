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

test.describe("Discovery panel on admin dashboard", () => {
  test("Discovery section is visible for admin", async ({
    page,
    context,
  }) => {
    const cookies = loadCookies("admin.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/admin");

    await expect(page.locator("h1")).toHaveText("Admin", { timeout: 10000 });

    // Discovery section heading
    await expect(page.getByRole("heading", { name: "Discovery" })).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("Automated documentation discovery")
    ).toBeVisible();
  });

  test("Sources table shows pre-seeded sources", async ({
    page,
    context,
  }) => {
    const cookies = loadCookies("admin.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/admin");

    await expect(page.locator("h1")).toHaveText("Admin", { timeout: 10000 });

    // Wait for sources to load
    await expect(page.getByText("npm Top 100")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("PyPI Top 100")).toBeVisible();
    await expect(page.getByText("crates.io Top 50")).toBeVisible();
  });

  test("Queue panel shows status counts", async ({ page, context }) => {
    const cookies = loadCookies("admin.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/admin");

    await expect(page.locator("h1")).toHaveText("Admin", { timeout: 10000 });

    // Queue section
    await expect(page.getByText("Queue")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Pending:")).toBeVisible();
    await expect(page.getByText("Done:")).toBeVisible();
    await expect(page.getByText("Skipped:")).toBeVisible();
    await expect(page.getByText("Errors:")).toBeVisible();
  });

  test("Run Now button exists and is clickable", async ({
    page,
    context,
  }) => {
    const cookies = loadCookies("admin.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/admin");

    await expect(page.locator("h1")).toHaveText("Admin", { timeout: 10000 });

    const runButton = page.getByRole("button", { name: "Run Now" });
    await expect(runButton).toBeVisible({ timeout: 10000 });
    await expect(runButton).toBeEnabled();
  });

  test("Add RSS Feed button opens modal", async ({ page, context }) => {
    const cookies = loadCookies("admin.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/admin");

    await expect(page.locator("h1")).toHaveText("Admin", { timeout: 10000 });

    const addButton = page.getByRole("button", { name: "Add RSS Feed" });
    await expect(addButton).toBeVisible({ timeout: 10000 });

    // Wait for sources data to load (proves React hydration is complete)
    await expect(page.getByText("npm Top 100")).toBeVisible({ timeout: 10000 });

    // Click to open modal
    await addButton.click();

    // Modal should appear — check for the feed name input which is unique to the modal
    await expect(page.getByPlaceholder("Feed name")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByPlaceholder("Feed URL")).toBeVisible();

    // Cancel closes modal
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByPlaceholder("Feed name")).not.toBeVisible();
  });

  test("Source enable/disable toggle works", async ({ page, context }) => {
    const cookies = loadCookies("admin.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/admin");

    await expect(page.locator("h1")).toHaveText("Admin", { timeout: 10000 });

    // Wait for sources to load
    await expect(page.getByText("npm Top 100")).toBeVisible({ timeout: 10000 });

    // Find the first "On" toggle button and click it
    const onButton = page.getByRole("button", { name: "On" }).first();
    await expect(onButton).toBeVisible();
    await onButton.click();

    // Should now show "Off"
    await expect(page.getByRole("button", { name: "Off" }).first()).toBeVisible({
      timeout: 5000,
    });

    // Toggle back
    await page.getByRole("button", { name: "Off" }).first().click();
    await expect(page.getByRole("button", { name: "On" }).first()).toBeVisible({
      timeout: 5000,
    });
  });
});
