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

test.describe("API Keys", () => {
  test("Shows existing API keys", async ({ page, context }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/keys");

    await expect(page.locator("h1")).toHaveText("API Keys", { timeout: 10000 });
    // Setup creates at least one key ("user-read-key") for the test user
    await expect(page.getByText("user-read-key")).toBeVisible({ timeout: 10000 });
  });

  test("Create Key button is visible", async ({ page, context }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/keys");

    await expect(page.locator("h1")).toHaveText("API Keys", { timeout: 10000 });
    await expect(
      page.getByRole("button", { name: "Create Key" })
    ).toBeVisible();
  });

  test("Can create a new key", async ({ page, context }) => {
    const cookies = loadCookies("user.json");
    await context.addCookies(cookies);
    await page.goto("/dashboard/keys");

    await expect(page.locator("h1")).toHaveText("API Keys", { timeout: 10000 });
    // Wait for hydration before clicking interactive elements
    await page.waitForLoadState("networkidle");

    // Click "Create Key" to show the form
    await page.getByRole("button", { name: "Create Key" }).click();

    // Fill in the key name — placeholder includes example text
    const keyNameInput = page.getByPlaceholder("Key name", { exact: false });
    await expect(keyNameInput).toBeVisible({ timeout: 5000 });
    await keyNameInput.fill(`ui-test-key-${Date.now()}`);

    // Submit the form by clicking the "Create" button inside the form
    await page.locator("form").getByRole("button", { name: "Create" }).click();

    // After creation, the key value should be displayed with a copy prompt
    await expect(
      page.getByText("API key created", { exact: false })
    ).toBeVisible({ timeout: 10000 });
  });
});
