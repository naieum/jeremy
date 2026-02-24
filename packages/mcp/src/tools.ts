import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JeremyClient } from "./client.js";
import { ProjectState } from "./project-state.js";
import { budgetChunks, formatSourceFooter, slugify, estimateTokens } from "./format.js";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/** Re-hydrate project state from API. Returns count of chunks loaded. */
async function rehydrateFromApi(client: JeremyClient, state: ProjectState, libraryId: string): Promise<number> {
  try {
    const existing = await client.getLibrary(libraryId);
    if (!existing?.chunks?.length) return 0;

    for (const chunk of existing.chunks) {
      const suffix = chunk.id.startsWith(`${libraryId}:`)
        ? chunk.id.slice(libraryId.length + 1)
        : chunk.id;
      const colonIdx = suffix.indexOf(":");
      const category = colonIdx > 0 ? suffix.slice(0, colonIdx) : "feature";
      const slug = colonIdx > 0 ? suffix.slice(colonIdx + 1) : suffix;

      state.setChunk({
        id: chunk.id,
        title: chunk.title ?? chunk.id,
        category,
        slug,
        content: "",
        tokenCount: chunk.tokenCount ?? 0,
        lastUpdated: new Date().toISOString(),
      });
    }
    return existing.chunks.length;
  } catch {
    return 0;
  }
}

export function registerTools(server: McpServer, client: JeremyClient, state: ProjectState): void {
  // ── Read-only doc lookup tools ────────────────────────────────────

  server.tool(
    "resolve-library-id",
    {
      libraryName: z
        .string()
        .describe(
          "The name of the library to search for (e.g. 'react', 'lodash')"
        ),
    },
    async ({ libraryName }) => {
      const result = await client.search(libraryName);

      if (!result.libraries || result.libraries.length === 0) {
        return textResult(`No libraries found matching "${libraryName}".`);
      }

      const lines = result.libraries.map((lib) => {
        const version = lib.version ? ` v${lib.version}` : "";
        return `${lib.name}${version} → ${lib.id}`;
      });

      return textResult(lines.join("\n"));
    }
  );

  server.tool(
    "query-docs",
    {
      libraryId: z
        .string()
        .describe("The library ID returned by resolve-library-id"),
      query: z
        .string()
        .describe("The question or topic to look up in the documentation"),
      topic: z
        .string()
        .optional()
        .describe("Optional topic to narrow the search (e.g. 'hooks', 'api')"),
      maxTokens: z
        .number()
        .optional()
        .describe("Maximum tokens in response (default 3000)"),
    },
    async ({ libraryId, query, topic, maxTokens }) => {
      const fullQuery = topic ? `${topic}: ${query}` : query;
      const budget = maxTokens ?? 3000;
      const result = await client.getContext(libraryId, fullQuery, {
        topK: 5,
        maxTokens: budget,
      });

      if (!result.chunks || result.chunks.length === 0) {
        return textResult(`No documentation found for "${query}" in library "${libraryId}".`);
      }

      const text = budgetChunks(result.chunks, budget);
      const footer = formatSourceFooter(result.chunks);

      return textResult(text + footer);
    }
  );

  server.tool(
    "lookup-docs",
    {
      libraryName: z
        .string()
        .describe(
          "The name of the library to look up (e.g. 'react', 'lodash')"
        ),
      query: z
        .string()
        .describe("The question or topic to look up in the documentation"),
      maxTokens: z
        .number()
        .optional()
        .describe("Maximum tokens in response (default 3000)"),
    },
    async ({ libraryName, query, maxTokens }) => {
      const budget = maxTokens ?? 3000;
      const result = await client.queryByName(libraryName, query, {
        topK: 5,
        maxTokens: budget,
      });

      if (!result.chunks || result.chunks.length === 0) {
        return textResult(`No documentation found for "${query}" in library "${libraryName}".`);
      }

      let header = "";
      if (result.library) {
        const version = result.library.version ? ` v${result.library.version}` : "";
        header = `[${result.libraryId}] ${result.library.name}${version}\n\n`;
      }

      const text = budgetChunks(result.chunks, budget);
      const footer = formatSourceFooter(result.chunks);

      return textResult(header + text + footer);
    }
  );

  // ── Project tracking tools ────────────────────────────────────────

  server.tool(
    "init-project",
    {
      projectName: z.string().describe("Name of the project to track"),
      description: z.string().optional().describe("Short project description"),
      version: z.string().optional().describe("Version variant (e.g. '2.0-beta', '16-rc')"),
    },
    async ({ projectName, description, version }) => {
      const slug = version
        ? `${slugify(projectName)}-${slugify(version)}`
        : slugify(projectName);
      const libraryId = `project:${slug}`;

      state.init({ libraryId, name: projectName, description, version });

      const count = await rehydrateFromApi(client, state, libraryId);
      const status = count > 0
        ? `Re-hydrated ${count} existing chunks.`
        : "No existing docs — starting fresh.";

      const versionLabel = version ? ` v${version}` : "";
      return textResult(`Initialized ${libraryId} (${projectName}${versionLabel})\n${status}`);
    }
  );

  const categoryEnum = z.enum(["feature", "api", "component", "architecture", "guide", "config"]);

  server.tool(
    "document-feature",
    {
      title: z.string().describe("Title of the documentation chunk"),
      category: categoryEnum.describe("Category of the documentation"),
      content: z.string().min(1).describe("Markdown content of the documentation"),
      slug: z.string().optional().describe("URL-safe slug (auto-generated from title if omitted)"),
    },
    async ({ title, category, content, slug }) => {
      state.assertInitialized();
      const chunkSlug = slug ?? slugify(title);
      const chunkId = state.makeChunkId(category, chunkSlug);
      const tokenCount = estimateTokens(content);
      const isUpdate = state.getChunk(chunkId) !== undefined;

      state.setChunk({
        id: chunkId,
        title,
        category,
        slug: chunkSlug,
        content,
        tokenCount,
        lastUpdated: new Date().toISOString(),
      });

      return textResult(
        `${isUpdate ? "Updated" : "Created"}: ${title}\n` +
        `ID: ${chunkId}\n` +
        `~${tokenCount} tokens | ${state.listChunks().length} total docs (unsynced)`
      );
    }
  );

  server.tool(
    "remove-doc",
    {
      chunkId: z.string().optional().describe("Full chunk ID to remove"),
      category: categoryEnum.optional().describe("Category (used with slug to resolve chunk ID)"),
      slug: z.string().optional().describe("Slug (used with category to resolve chunk ID)"),
    },
    async ({ chunkId, category, slug }) => {
      state.assertInitialized();

      const resolvedId = chunkId ?? (category && slug ? state.makeChunkId(category, slug) : null);
      if (!resolvedId) {
        return errorResult("Provide either chunkId or both category and slug.");
      }

      const chunk = state.getChunk(resolvedId);
      if (!chunk) {
        return errorResult(`Chunk not found: ${resolvedId}`);
      }

      state.removeChunk(resolvedId);

      const remaining = state.listChunks().length;
      return textResult(`Removed: ${chunk.title} (${resolvedId}), ${remaining} remaining (unsynced)`);
    }
  );

  server.tool(
    "list-project-docs",
    {
      refresh: z.boolean().optional().describe("Re-fetch from API instead of using local state"),
    },
    async ({ refresh }) => {
      const project = state.assertInitialized();

      if (refresh || state.listChunks().length === 0) {
        await rehydrateFromApi(client, state, project.libraryId);
      }

      const chunks = state.listChunks();
      if (chunks.length === 0) {
        return textResult(`${project.libraryId} has no docs yet.`);
      }

      const lines = chunks.map((c) =>
        `[${c.category}] ${c.title} (~${c.tokenCount} tok) ${c.id}`
      );

      const dirtyHint = state.isDirty() ? " (unsynced changes)" : "";
      return textResult(
        `${project.libraryId} (${project.name}) — ${chunks.length} docs${dirtyHint}\n` +
        lines.join("\n")
      );
    }
  );

  server.tool(
    "sync-project-docs",
    {},
    async () => {
      const project = state.assertInitialized();
      const chunks = state.getAllChunksForIngest();

      if (!state.isDirty()) {
        return textResult(`Already in sync. ${chunks.length} docs up to date.`);
      }

      try {
        if (chunks.length === 0) {
          await client.deleteLibrary(project.libraryId);
          state.markClean();
          return textResult(`Deleted ${project.libraryId} (all docs removed)`);
        }

        const result = await client.ingest({
          libraryId: project.libraryId,
          name: project.name,
          description: project.description,
          version: project.version,
          chunks,
          replace: true,
        });

        state.markClean();
        return textResult(
          `Synced ${result.chunksIngested} chunks to ${project.libraryId}\n` +
          `Vectorized: ${result.vectorized}`
        );
      } catch (e: any) {
        return errorResult(`Sync failed: ${e?.message}`);
      }
    }
  );
}
