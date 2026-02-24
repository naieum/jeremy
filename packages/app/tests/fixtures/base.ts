import { test as base, type APIRequestContext } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { ApiClient } from "../helpers/api-client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface StoredAuth {
  userId: string;
  apiKey: string;
  adminApiKey?: string;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
  }>;
}

function loadAuthState(filename: string): StoredAuth {
  const filePath = path.resolve(__dirname, "..", ".auth", filename);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export const test = base.extend<{
  userRequest: APIRequestContext;
  adminRequest: APIRequestContext;
  userApiKey: string;
  adminApiKey: string;
  userClient: ApiClient;
  adminClient: ApiClient;
  userId: string;
  adminUserId: string;
  otherUserId: string;
}>({
  userRequest: async ({ playwright }, use) => {
    const auth = loadAuthState("user.json");
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
      extraHTTPHeaders: {
        Cookie: auth.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      },
    });
    await use(ctx);
    await ctx.dispose();
  },

  adminRequest: async ({ playwright }, use) => {
    const auth = loadAuthState("admin.json");
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
      extraHTTPHeaders: {
        Cookie: auth.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      },
    });
    await use(ctx);
    await ctx.dispose();
  },

  userApiKey: async ({}, use) => {
    const auth = loadAuthState("user.json");
    await use(auth.apiKey);
  },

  adminApiKey: async ({}, use) => {
    const auth = loadAuthState("admin.json");
    await use(auth.adminApiKey ?? auth.apiKey);
  },

  userClient: async ({ playwright }, use) => {
    const auth = loadAuthState("user.json");
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
      extraHTTPHeaders: {
        Cookie: auth.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      },
    });
    await use(new ApiClient(ctx, auth.apiKey));
    await ctx.dispose();
  },

  adminClient: async ({ playwright }, use) => {
    const auth = loadAuthState("admin.json");
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:5199",
      extraHTTPHeaders: {
        Cookie: auth.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      },
    });
    await use(new ApiClient(ctx, auth.adminApiKey ?? auth.apiKey));
    await ctx.dispose();
  },

  userId: async ({}, use) => {
    const auth = loadAuthState("user.json");
    await use(auth.userId);
  },

  adminUserId: async ({}, use) => {
    const auth = loadAuthState("admin.json");
    await use(auth.userId);
  },

  otherUserId: async ({}, use) => {
    const auth = loadAuthState("other.json");
    await use(auth.userId);
  },
});

export { expect } from "@playwright/test";
