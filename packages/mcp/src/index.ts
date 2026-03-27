#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { JeremyClient } from "./client.js";
import { ProjectState } from "./project-state.js";
import { registerTools } from "./tools.js";
import { getStoredToken, deviceAuth } from "./auth.js";

const JEREMY_API_URL = process.env.JEREMY_API_URL ?? "https://jeremy.khuur.dev";

async function resolveApiKey(): Promise<string> {
  // 1. Env var override — skip device flow entirely
  if (process.env.JEREMY_API_KEY) {
    return process.env.JEREMY_API_KEY;
  }

  // 2. Check for stored token from previous device auth
  const stored = await getStoredToken(JEREMY_API_URL);
  if (stored) {
    return stored;
  }

  // 3. Run device authorization flow
  return deviceAuth(JEREMY_API_URL);
}

const apiKey = await resolveApiKey();

const server = new McpServer({ name: "jeremy", version: "1.0.0" });

const client = new JeremyClient(JEREMY_API_URL, apiKey);
const state = new ProjectState();

registerTools(server, client, state);

const transport = new StdioServerTransport();
await server.connect(transport);
