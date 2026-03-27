import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { exec } from "node:child_process";

const TOKEN_DIR = join(homedir(), ".jeremy");
const TOKEN_FILE = join(TOKEN_DIR, "tokens.json");

interface StoredTokens {
  access_token: string;
  base_url: string;
}

export async function getStoredToken(baseUrl: string): Promise<string | null> {
  try {
    const raw = await readFile(TOKEN_FILE, "utf-8");
    const data: StoredTokens = JSON.parse(raw);
    if (data.base_url === baseUrl && data.access_token) {
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

async function storeToken(baseUrl: string, accessToken: string): Promise<void> {
  await mkdir(TOKEN_DIR, { recursive: true });
  const data: StoredTokens = { access_token: accessToken, base_url: baseUrl };
  await writeFile(TOKEN_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" :
    platform === "win32" ? "start" :
    "xdg-open";

  exec(`${cmd} ${JSON.stringify(url)}`, (err) => {
    if (err) {
      // Browser open failed silently — user can still visit the URL manually
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deviceAuth(baseUrl: string): Promise<string> {
  // Step 1: Request device code
  const codeRes = await fetch(`${baseUrl}/api/auth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "jeremy-mcp" }),
  });

  if (!codeRes.ok) {
    const text = await codeRes.text().catch(() => "");
    throw new Error(`Failed to request device code: ${codeRes.status} ${text}`);
  }

  const codeData = (await codeRes.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  };

  const verifyUrl = codeData.verification_uri_complete || `${baseUrl}/device?code=${codeData.user_code}`;

  // Step 2: Print instructions to stderr (stdout is reserved for MCP protocol)
  process.stderr.write(`\n`);
  process.stderr.write(`  To authenticate, visit: ${verifyUrl}\n`);
  process.stderr.write(`  Enter code: ${codeData.user_code}\n`);
  process.stderr.write(`\n`);
  process.stderr.write(`  Waiting for authorization...\n`);

  // Step 3: Open browser
  openBrowser(verifyUrl);

  // Step 4: Poll for token
  let interval = (codeData.interval || 5) * 1000;
  const deadline = Date.now() + codeData.expires_in * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);

    const tokenRes = await fetch(`${baseUrl}/api/device-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_code: codeData.device_code,
        client_id: "jeremy-mcp",
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (tokenRes.ok) {
      const tokenData = (await tokenRes.json()) as { access_token: string };
      process.stderr.write(`  Authenticated successfully!\n\n`);
      await storeToken(baseUrl, tokenData.access_token);
      return tokenData.access_token;
    }

    const errData = (await tokenRes.json().catch(() => null)) as {
      error?: string;
    } | null;

    const errCode = errData?.error;

    if (errCode === "authorization_pending") {
      continue;
    }

    if (errCode === "slow_down") {
      interval += 5000;
      continue;
    }

    if (errCode === "expired_token") {
      throw new Error("Device code expired. Please try again.");
    }

    if (errCode === "access_denied") {
      throw new Error("Authorization denied by user.");
    }

    throw new Error(`Device auth failed: ${errCode ?? tokenRes.statusText}`);
  }

  throw new Error("Device code expired. Please try again.");
}
