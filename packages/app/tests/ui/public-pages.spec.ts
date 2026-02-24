import { test, expect } from "../fixtures/base";

test.describe("Public pages", () => {
  test("Landing page shows 'Jeremy' heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Jeremy");
  });

  test("Landing page has login link", async ({ page }) => {
    await page.goto("/");
    const loginLink = page.getByRole("link", { name: "Log In" });
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute("href", /\/login/);
  });

  test("Landing page has privacy and terms footer links", async ({ page }) => {
    await page.goto("/");
    const privacyLink = page.getByRole("link", { name: "Privacy Policy" });
    const termsLink = page.getByRole("link", { name: "Terms of Service" });
    await expect(privacyLink).toBeVisible();
    await expect(termsLink).toBeVisible();
  });

  test("Privacy page renders content", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("h1")).toHaveText("Privacy Policy", { timeout: 10000 });
    // Section headings on the privacy page
    await expect(page.getByText("1. Data Collection")).toBeVisible();
    await expect(page.getByText("2. Authentication")).toBeVisible();
  });

  test("Terms page renders content", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("h1")).toHaveText("Terms of Service", { timeout: 10000 });
    // Section headings on the terms page
    await expect(page.getByText("1. Acceptance")).toBeVisible();
    await expect(page.getByText("2. Self-Hosting")).toBeVisible();
  });

  test("Login page shows sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toHaveText("Sign In");
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
  });
});
