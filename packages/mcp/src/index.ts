#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { JeremyClient } from "./client.js";
import { ProjectState } from "./project-state.js";
import { registerTools } from "./tools.js";

const JEREMY_API_URL = process.env.JEREMY_API_URL ?? "https://jeremy.khuur.dev";
const JEREMY_API_KEY = process.env.JEREMY_API_KEY ?? "";

const server = new McpServer({ name: "jeremy", version: "1.0.0" });

const client = new JeremyClient(JEREMY_API_URL, JEREMY_API_KEY);
const state = new ProjectState();

registerTools(server, client, state);

const transport = new StdioServerTransport();
await server.connect(transport);
