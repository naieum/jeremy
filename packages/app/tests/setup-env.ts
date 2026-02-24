/**
 * Pre-test script: cleans D1, runs migrations, starts a temp dev server,
 * signs up test users, captures admin user ID, writes .dev.vars, stops server.
 *
 * Run via: npx tsx tests/setup-env.ts
 */
import { execSync, spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

function killServer(server: ChildProcess) {
  if (server.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, "..");
const DEV_VARS_PATH = path.join(APP_DIR, ".dev.vars");
const AUTH_DIR = path.join(APP_DIR, "tests", ".auth");
const TEST_PORT = 5199;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const CRON_SECRET = "test-cron-secret";

const ADMIN_USER = {
  email: "admin@test.com",
  password: "AdminPass123!",
  name: "Admin User",
};

const TEST_USER = {
  email: "testuser@test.com",
  password: "TestPass123!",
  name: "Test User",
};

const OTHER_USER = {
  email: "other@test.com",
  password: "OtherPass123!",
  name: "Other User",
};

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

interface SignUpResult {
  userId: string;
  cookies: Array<{ name: string; value: string; domain: string; path: string }>;
}

async function signUpUser(creds: {
  email: string;
  password: string;
  name: string;
}): Promise<SignUpResult> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
    },
    body: JSON.stringify(creds),
    redirect: "manual",
  });

  let body: any = {};
  try { body = await res.json(); } catch {}
  const setCookie = res.headers.getSetCookie?.() ?? [];

  const cookies = setCookie.map((c: string) => {
    const parts = c.split(";")[0].split("=");
    const name = parts[0].trim();
    const value = parts.slice(1).join("=").trim();
    return { name, value, domain: "localhost", path: "/" };
  });

  const userId = body?.user?.id ?? body?.id ?? "";

  if (!userId) {
    const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
    const sessionRes = await fetch(`${BASE_URL}/api/auth/get-session`, {
      headers: { Cookie: cookieHeader },
    });
    const sessionBody = await sessionRes.json().catch(() => ({})) as any;
    return { userId: sessionBody?.user?.id ?? "", cookies };
  }

  return { userId, cookies };
}

async function signInUser(creds: {
  email: string;
  password: string;
}): Promise<{
  userId: string;
  cookies: Array<{ name: string; value: string; domain: string; path: string }>;
}> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
    },
    body: JSON.stringify(creds),
    redirect: "manual",
  });

  let body: any = {};
  try { body = await res.json(); } catch {}
  const setCookie = res.headers.getSetCookie?.() ?? [];

  const cookies = setCookie.map((c: string) => {
    const parts = c.split(";")[0].split("=");
    const name = parts[0].trim();
    const value = parts.slice(1).join("=").trim();
    return { name, value, domain: "localhost", path: "/" };
  });

  const userId = body?.user?.id ?? body?.id ?? "";

  if (!userId) {
    const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
    const sessionRes = await fetch(`${BASE_URL}/api/auth/get-session`, {
      headers: { Cookie: cookieHeader },
    });
    const sessionBody = await sessionRes.json().catch(() => ({})) as any;
    return { userId: sessionBody?.user?.id ?? "", cookies };
  }

  return { userId, cookies };
}

async function createApiKey(
  cookies: Array<{ name: string; value: string }>,
  name: string,
  permissions: "read" | "admin" = "read"
): Promise<string> {
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await fetch(`${BASE_URL}/api/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ name, permissions }),
  });
  let body: any = {};
  try { body = await res.json(); } catch {}
  return body.key ?? "";
}

async function main() {
  console.log("=== Jeremy E2E Test Setup ===\n");

  // 1. Clean local D1 state
  console.log("1. Cleaning local D1 state...");
  const d1Dir = path.join(APP_DIR, ".wrangler", "state");
  if (fs.existsSync(d1Dir)) {
    fs.rmSync(d1Dir, { recursive: true, force: true });
    console.log("   Cleaned .wrangler/state");
  }

  // 2. Run D1 migrations
  console.log("2. Running D1 migrations...");
  const migrationFiles = fs.readdirSync(path.join(APP_DIR, "drizzle"))
    .filter((f: string) => f.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const filePath = path.join("drizzle", file);
    console.log(`   Running migration: ${file}`);
    execSync(`npx wrangler d1 execute jeremy-db --local --file ${filePath}`, {
      cwd: APP_DIR,
      stdio: "pipe",
    });
  }

  // 3. Write initial .dev.vars (without ADMIN_USER_ID yet)
  console.log("3. Writing initial .dev.vars...");
  const devVars = [
    "BETTER_AUTH_SECRET=jeremy-test-secret-at-least-32-chars-long-here",
    "GITHUB_CLIENT_ID=test-github-client-id",
    "GITHUB_CLIENT_SECRET=test-github-client-secret",
    "GOOGLE_CLIENT_ID=test-google-client-id",
    "GOOGLE_CLIENT_SECRET=test-google-client-secret",
    `CRON_SECRET=${CRON_SECRET}`,
    "ADMIN_USER_ID=placeholder",
  ].join("\n");
  fs.writeFileSync(DEV_VARS_PATH, devVars + "\n");

  // 4. Start temporary dev server
  console.log("4. Starting temporary dev server...");
  const devServer: ChildProcess = spawn("npx", ["vite", "dev", "--port", String(TEST_PORT)], {
    cwd: APP_DIR,
    stdio: "pipe",
    env: { ...process.env },
    shell: true,
    detached: true,
  });

  devServer.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) console.log(`   [dev] ${line}`);
  });
  devServer.stdout?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) console.log(`   [dev] ${line}`);
  });

  try {
    await waitForServer(BASE_URL);
    console.log("   Server is ready!");

    // 5. Sign up users
    console.log("5. Signing up test users...");

    const admin = await signUpUser(ADMIN_USER);
    console.log(`   Admin user ID: ${admin.userId}`);

    const user = await signUpUser(TEST_USER);
    console.log(`   Test user ID: ${user.userId}`);

    const other = await signUpUser(OTHER_USER);
    console.log(`   Other user ID: ${other.userId}`);

    // 6. Stop server to update env
    console.log("6. Stopping server to update ADMIN_USER_ID...");
    killServer(devServer);
    await new Promise((r) => setTimeout(r, 2000));

    // 7. Write final .dev.vars with real ADMIN_USER_ID
    console.log("7. Writing final .dev.vars...");
    const finalDevVars = [
      "BETTER_AUTH_SECRET=jeremy-test-secret-at-least-32-chars-long-here",
      "GITHUB_CLIENT_ID=test-github-client-id",
      "GITHUB_CLIENT_SECRET=test-github-client-secret",
      "GOOGLE_CLIENT_ID=test-google-client-id",
      "GOOGLE_CLIENT_SECRET=test-google-client-secret",
      `CRON_SECRET=${CRON_SECRET}`,
      `ADMIN_USER_ID=${admin.userId}`,
    ].join("\n");
    fs.writeFileSync(DEV_VARS_PATH, finalDevVars + "\n");
    console.log(`   ADMIN_USER_ID=${admin.userId}`);

    // 8. Restart server with correct env to create API keys
    console.log("8. Restarting server with correct ADMIN_USER_ID...");
    const devServer2: ChildProcess = spawn("npx", ["vite", "dev", "--port", String(TEST_PORT)], {
      cwd: APP_DIR,
      stdio: "pipe",
      env: { ...process.env },
      shell: true,
      detached: true,
    });
    devServer2.stderr?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line) console.log(`   [dev] ${line}`);
    });

    try {
      await waitForServer(BASE_URL);
      console.log("   Server restarted!");

      // Sign in users again (sessions were lost with server restart)
      console.log("9. Signing in users and creating API keys...");

      const adminSignIn = await signInUser(ADMIN_USER);
      const userSignIn = await signInUser(TEST_USER);
      const otherSignIn = await signInUser(OTHER_USER);

      // Create API keys
      const adminReadKey = await createApiKey(adminSignIn.cookies, "admin-read-key", "read");
      const adminAdminKey = await createApiKey(adminSignIn.cookies, "admin-admin-key", "admin");
      const userReadKey = await createApiKey(userSignIn.cookies, "user-read-key", "read");
      const otherReadKey = await createApiKey(otherSignIn.cookies, "other-read-key", "read");

      console.log(`   Admin read key: ${adminReadKey.slice(0, 12)}...`);
      console.log(`   Admin admin key: ${adminAdminKey.slice(0, 12)}...`);
      console.log(`   User read key: ${userReadKey.slice(0, 12)}...`);

      // 10. Save auth state
      console.log("10. Saving auth state...");
      if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }

      fs.writeFileSync(
        path.join(AUTH_DIR, "admin.json"),
        JSON.stringify({
          userId: admin.userId,
          apiKey: adminReadKey,
          adminApiKey: adminAdminKey,
          cookies: adminSignIn.cookies,
        }, null, 2)
      );

      fs.writeFileSync(
        path.join(AUTH_DIR, "user.json"),
        JSON.stringify({
          userId: user.userId,
          apiKey: userReadKey,
          cookies: userSignIn.cookies,
        }, null, 2)
      );

      fs.writeFileSync(
        path.join(AUTH_DIR, "other.json"),
        JSON.stringify({
          userId: other.userId,
          apiKey: otherReadKey,
          cookies: otherSignIn.cookies,
        }, null, 2)
      );

      // 11. Seed test data via ingest API
      console.log("11. Seeding test data...");
      await seedTestData(adminAdminKey, userSignIn.cookies, otherSignIn.cookies);

      // 12. Verify all sessions are accessible before stopping
      console.log("12. Verifying sessions...");
      for (const [label, signIn] of [["admin", adminSignIn], ["user", userSignIn], ["other", otherSignIn]] as const) {
        const cookieHeader = (signIn as any).cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
        const res = await fetch(`${BASE_URL}/api/auth/get-session`, {
          headers: { Cookie: cookieHeader },
        });
        const body = await res.json().catch(() => null) as any;
        const ok = body?.user?.id ? "OK" : "FAILED";
        console.log(`   ${label} session: ${ok}`);
      }

      // Give D1 time to flush writes to disk
      await new Promise((r) => setTimeout(r, 2000));

      console.log("\n=== Setup Complete ===\n");
    } finally {
      killServer(devServer2);
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch (err) {
    killServer(devServer);
    throw err;
  }
}

async function seedTestData(
  adminApiKey: string,
  userCookies: Array<{ name: string; value: string }>,
  otherCookies: Array<{ name: string; value: string }>
): Promise<void> {
  const userCookieHeader = userCookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const otherCookieHeader = otherCookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // Seed test user's library via session auth
  const userIngestRes = await fetch(`${BASE_URL}/api/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: userCookieHeader,
    },
    body: JSON.stringify({
      libraryId: "test-lib-1",
      name: "test-library",
      description: "A test library for e2e tests",
      sourceType: "manual",
      version: "1.0.0",
      chunks: [
        {
          id: "test-lib-1:chunk-1",
          title: "Getting Started",
          content: "This is the getting started guide for test-library. Install with npm install test-library.",
          url: "https://example.com/docs/getting-started",
          tokenCount: 20,
        },
        {
          id: "test-lib-1:chunk-2",
          title: "API Reference",
          content: "The main export is the createClient function which accepts a config object.",
          url: "https://example.com/docs/api",
          tokenCount: 18,
        },
        {
          id: "test-lib-1:chunk-3",
          title: "Configuration",
          content: "Configuration options include host, port, timeout, and retries.",
          url: "https://example.com/docs/config",
          tokenCount: 12,
        },
      ],
      skipEmbeddings: true,
    }),
  });
  const userIngestBody = await userIngestRes.json() as any;
  console.log(`   User library: ${userIngestBody.success ? "OK" : "FAILED"} (${userIngestBody.chunksIngested ?? 0} chunks)`);

  // Seed other user's public library
  const publicIngestRes = await fetch(`${BASE_URL}/api/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: otherCookieHeader,
    },
    body: JSON.stringify({
      libraryId: "public-lib-1",
      name: "public-library",
      description: "A public library owned by another user",
      sourceType: "manual",
      version: "1.0.0",
      chunks: [
        {
          id: "public-lib-1:chunk-1",
          title: "Public Docs",
          content: "This is a publicly accessible library with documentation.",
          url: "https://example.com/public/docs",
          tokenCount: 12,
        },
      ],
      skipEmbeddings: true,
    }),
  });
  const publicIngestBody = await publicIngestRes.json() as any;
  console.log(`   Public library: ${publicIngestBody.success ? "OK" : "FAILED"}`);

  // Seed other user's private library
  const privateIngestRes = await fetch(`${BASE_URL}/api/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: otherCookieHeader,
    },
    body: JSON.stringify({
      libraryId: "private-lib-1",
      name: "private-library",
      description: "A private library owned by another user",
      sourceType: "manual",
      version: "1.0.0",
      chunks: [
        {
          id: "private-lib-1:chunk-1",
          title: "Private Docs",
          content: "This is a private library that should not be accessible to other users.",
          url: "https://example.com/private/docs",
          tokenCount: 14,
        },
      ],
      skipEmbeddings: true,
    }),
  });
  const privateIngestBody = await privateIngestRes.json() as any;
  console.log(`   Private library: ${privateIngestBody.success ? "OK" : "FAILED"}`);

  // Set private library to isPublic=0 via wrangler d1
  try {
    execSync(
      `npx wrangler d1 execute jeremy-db --local --command "UPDATE libraries SET is_public = 0 WHERE id = 'private-lib-1'"`,
      { cwd: APP_DIR, stdio: "pipe" }
    );
    console.log("   Set private-lib-1 to isPublic=0");
  } catch (e: any) {
    console.warn("   Warning: Failed to set private library:", e.message);
  }
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
