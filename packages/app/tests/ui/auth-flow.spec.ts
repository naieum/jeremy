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

test.describe("Auth flow", () => {
  test("Sign-in form visible by default", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toHaveText("Sign In");
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
    // Name field should NOT be visible in sign-in mode
    await expect(page.getByPlaceholder("Name")).not.toBeVisible();
  });

  test("'Sign up' toggle shows name field", async ({ page }) => {
    await page.goto("/login");
    // Wait for hydration before clicking interactive elements
    await page.waitForLoadState("networkidle");
    const signUpToggle = page.locator("p").getByRole("button", { name: "Sign up" });
    await signUpToggle.click();
    await expect(page.locator("h1")).toHaveText("Create Account");
    await expect(page.getByPlaceholder("Name")).toBeVisible();
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
  });

  test("GitHub and Google OAuth buttons visible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "GitHub" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
  });

  test("Email signup creates account and redirects to /dashboard", async ({
    page,
  }) => {
    await page.goto("/login");
    // Wait for hydration
    await page.waitForLoadState("networkidle");
    // Switch to sign-up mode
    const signUpToggle = page.locator("p").getByRole("button", { name: "Sign up" });
    await signUpToggle.click();
    await expect(page.getByPlaceholder("Name")).toBeVisible();

    const uniqueEmail = `signup-${Date.now()}@test.com`;
    await page.getByPlaceholder("Name").fill("Signup Test User");
    await page.getByPlaceholder("Email").fill(uniqueEmail);
    await page.getByPlaceholder("Password").fill("TestSignup123!");
    await page.getByRole("button", { name: "Sign Up" }).click();

    await page.waitForURL("**/dashboard", { timeout: 15000 });
    expect(page.url()).toContain("/dashboard");
  });

  test("Invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByPlaceholder("Email").fill("nonexistent@fake.com");
    await page.getByPlaceholder("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Wait for error message to appear — Better Auth returns error in the response
    await expect(page.locator(".text-danger")).toBeVisible({ timeout: 10000 });
  });

  test("Logout redirects to /", async ({ page }) => {
    // Sign in via the login form to create a FRESH session
    // (don't use saved user.json cookies — logging out invalidates the session in D1
    // which would break other tests that depend on those cookies)
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByPlaceholder("Email").fill("testuser@test.com");
    await page.getByPlaceholder("Password").fill("TestPass123!");
    await page.getByRole("button", { name: "Sign In" }).click();

    await page.waitForURL("**/dashboard", { timeout: 15000 });

    // Click the "Sign Out" button in the nav
    await page.getByRole("button", { name: "Sign Out" }).click();

    // Should redirect to the landing page
    await page.waitForURL("/", { timeout: 10000 });
    expect(page.url()).toMatch(/\/$/);
  });
});
