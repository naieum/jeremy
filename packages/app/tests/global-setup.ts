import { test as setup, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

/**
 * Global setup project — validates that auth state exists
 * (created by the setup-env.ts pre-test script).
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_DIR = path.resolve(__dirname, ".auth");

setup("validate auth state exists", async () => {
  const files = ["admin.json", "user.json", "other.json"];
  for (const file of files) {
    const filePath = path.join(AUTH_DIR, file);
    expect(
      fs.existsSync(filePath),
      `Auth state file missing: ${filePath}. Run 'npm run test:setup' first.`
    ).toBe(true);

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(data.userId, `userId missing in ${file}`).toBeTruthy();
    expect(data.cookies, `cookies missing in ${file}`).toBeTruthy();
    expect(data.apiKey, `apiKey missing in ${file}`).toBeTruthy();
  }
});

setup("validate server is responding", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBeLessThan(500);
});

setup("validate session auth works", async ({ request }) => {
  const auth = JSON.parse(
    fs.readFileSync(path.join(AUTH_DIR, "user.json"), "utf-8")
  );
  const cookieHeader = auth.cookies
    .map((c: any) => `${c.name}=${c.value}`)
    .join("; ");

  const res = await request.get("/api/auth/get-session", {
    headers: { Cookie: cookieHeader },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body?.user?.id).toBe(auth.userId);
});

setup("validate API key auth works", async ({ request }) => {
  const auth = JSON.parse(
    fs.readFileSync(path.join(AUTH_DIR, "user.json"), "utf-8")
  );

  const res = await request.get("/api/search?libraryName=test-library", {
    headers: { Authorization: `Bearer ${auth.apiKey}` },
  });
  expect(res.status()).toBe(200);
});
