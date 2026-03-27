import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq, like, or, and, inArray } from "drizzle-orm";
import { generateEmbedding, generateEmbeddings } from "../lib/embeddings";
import { queryVectors, upsertVectors, deleteVectorsByLibrary } from "../lib/vectorize";
import { getCached, setCache, invalidateLibrary } from "../lib/cache";

// --- Constants ---

const MAX_SESSION_CHUNKS = 100;
const MAX_CONTENT_LENGTH = 50_000; // 50KB per chunk
const MAX_SESSION_ID_LENGTH = 128;
const MAX_TOKEN_BUDGET = 10_000;
const MAX_STRING_ARG_LENGTH = 500;
const VALID_CATEGORIES = new Set([
  "feature",
  "api",
  "component",
  "architecture",
  "guide",
  "config",
]);

// --- Types ---

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: any;
}

interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface SessionState {
  project: {
    libraryId: string;
    name: string;
    description?: string;
    version?: string;
  } | null;
  chunks: Array<{
    id: string;
    title: string;
    category: string;
    slug: string;
    content: string;
    tokenCount: number;
    lastUpdated: string;
  }>;
  dirty: boolean;
}

// --- Tool Definitions ---

const TOOLS: McpToolDef[] = [
  {
    name: "resolve-library-id",
    description:
      "Search for a documentation library by name. Returns matching library IDs that can be used with query-docs.",
    inputSchema: {
      type: "object",
      properties: {
        libraryName: {
          type: "string",
          description:
            "The name of the library to search for (e.g. 'react', 'lodash')",
        },
      },
      required: ["libraryName"],
    },
  },
  {
    name: "query-docs",
    description:
      "Query documentation for a specific library using semantic search. Returns relevant documentation chunks.",
    inputSchema: {
      type: "object",
      properties: {
        libraryId: {
          type: "string",
          description: "The library ID returned by resolve-library-id",
        },
        query: {
          type: "string",
          description:
            "The question or topic to look up in the documentation",
        },
        topic: {
          type: "string",
          description:
            "Optional topic to narrow the search (e.g. 'hooks', 'api')",
        },
        maxTokens: {
          type: "number",
          description: "Maximum tokens in response (default 3000)",
        },
      },
      required: ["libraryId", "query"],
    },
  },
  {
    name: "lookup-docs",
    description:
      "Look up documentation by library name (combines resolve + query in one call). Returns relevant documentation chunks.",
    inputSchema: {
      type: "object",
      properties: {
        libraryName: {
          type: "string",
          description:
            "The name of the library to look up (e.g. 'react', 'lodash')",
        },
        query: {
          type: "string",
          description:
            "The question or topic to look up in the documentation",
        },
        maxTokens: {
          type: "number",
          description: "Maximum tokens in response (default 3000)",
        },
      },
      required: ["libraryName", "query"],
    },
  },
  {
    name: "init-project",
    description:
      "Initialize a project for documentation tracking. Call this before document-feature.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "Name of the project to track",
        },
        description: {
          type: "string",
          description: "Short project description",
        },
        version: {
          type: "string",
          description: "Version variant (e.g. '2.0-beta', '16-rc')",
        },
      },
      required: ["projectName"],
    },
  },
  {
    name: "document-feature",
    description:
      "Create or update a documentation chunk for the current project. Call sync-project-docs to push changes.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Title of the documentation chunk",
        },
        category: {
          type: "string",
          enum: [
            "feature",
            "api",
            "component",
            "architecture",
            "guide",
            "config",
          ],
          description: "Category of the documentation",
        },
        content: {
          type: "string",
          description: "Markdown content of the documentation",
        },
        slug: {
          type: "string",
          description:
            "URL-safe slug (auto-generated from title if omitted)",
        },
      },
      required: ["title", "category", "content"],
    },
  },
  {
    name: "remove-doc",
    description:
      "Remove a documentation chunk from the current project.",
    inputSchema: {
      type: "object",
      properties: {
        chunkId: {
          type: "string",
          description: "Full chunk ID to remove",
        },
        category: {
          type: "string",
          enum: [
            "feature",
            "api",
            "component",
            "architecture",
            "guide",
            "config",
          ],
          description: "Category (used with slug to resolve chunk ID)",
        },
        slug: {
          type: "string",
          description: "Slug (used with category to resolve chunk ID)",
        },
      },
    },
  },
  {
    name: "list-project-docs",
    description:
      "List all documentation chunks for the current project.",
    inputSchema: {
      type: "object",
      properties: {
        refresh: {
          type: "boolean",
          description:
            "Re-fetch from API instead of using session state",
        },
      },
    },
  },
  {
    name: "sync-project-docs",
    description:
      "Push all pending documentation changes to the server.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// --- Helpers ---

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/** Escape SQL LIKE wildcard characters */
function escapeLike(text: string): string {
  return text.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToTokens(text: string, budget: number): string {
  const charBudget = budget * 4;
  if (text.length <= charBudget) return text;
  const truncated = text.slice(0, charBudget);
  const lastSentence = truncated.search(/[.!?]\s[^.!?]*$/);
  if (lastSentence > charBudget * 0.5) {
    return truncated.slice(0, lastSentence + 1) + "\n\n[truncated]";
  }
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > charBudget * 0.5) {
    return truncated.slice(0, lastSpace) + "\n\n[truncated]";
  }
  return truncated + "\n\n[truncated]";
}

function formatChunk(chunk: {
  title: string | null;
  content: string;
}): string {
  const content = chunk.content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
  if (!chunk.title) return content;
  const firstLine = content.split("\n", 1)[0];
  const stripped = firstLine.replace(/^#+\s*/, "").trim();
  if (stripped.toLowerCase() === chunk.title.trim().toLowerCase())
    return content;
  return `## ${chunk.title}\n${content}`;
}

function budgetChunks(
  chunks: Array<{
    title: string | null;
    content: string;
    url?: string | null;
  }>,
  maxTokens: number = 3000
): string {
  const parts: string[] = [];
  let remaining = maxTokens;
  for (const chunk of chunks) {
    const formatted = formatChunk(chunk);
    const cost = estimateTokens(formatted);
    if (cost <= remaining) {
      parts.push(formatted);
      remaining -= cost;
    } else if (remaining > 50) {
      parts.push(truncateToTokens(formatted, remaining));
      break;
    } else {
      break;
    }
  }
  return parts.join("\n\n");
}

function formatSourceFooter(
  chunks: Array<{ url?: string | null }>
): string {
  const urls = chunks
    .map((c) => c.url)
    .filter((url): url is string => !!url);
  const unique = [...new Set(urls)];
  if (unique.length === 0) return "";
  return `\n\nSources: ${unique.join(" · ")}`;
}

function textResult(text: string) {
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text", text }], isError: true };
}

/** Validate and coerce a string argument */
function requireString(
  args: any,
  field: string,
  maxLen = MAX_STRING_ARG_LENGTH
): string | null {
  const val = args?.[field];
  if (typeof val !== "string" || val.length === 0) return null;
  return val.slice(0, maxLen);
}

// --- Session State Management ---

async function getSession(
  sessionId: string,
  userId: string
): Promise<SessionState> {
  const key = `mcp:session:${userId}:${sessionId}`;
  const cached = await getCached<SessionState>(key);
  return cached ?? { project: null, chunks: [], dirty: false };
}

async function saveSession(
  sessionId: string,
  userId: string,
  state: SessionState
): Promise<void> {
  const key = `mcp:session:${userId}:${sessionId}`;
  await setCache(key, state, 3600);
}

// --- Tool Implementations ---

async function handleToolCall(
  toolName: string,
  args: any,
  userId: string,
  sessionId: string
): Promise<any> {
  switch (toolName) {
    case "resolve-library-id":
      return handleResolveLibraryId(args, userId);
    case "query-docs":
      return handleQueryDocs(args, userId);
    case "lookup-docs":
      return handleLookupDocs(args, userId);
    case "init-project":
      return handleInitProject(args, userId, sessionId);
    case "document-feature":
      return handleDocumentFeature(args, userId, sessionId);
    case "remove-doc":
      return handleRemoveDoc(args, userId, sessionId);
    case "list-project-docs":
      return handleListProjectDocs(args, userId, sessionId);
    case "sync-project-docs":
      return handleSyncProjectDocs(userId, sessionId);
    default:
      return errorResult(`Unknown tool: ${toolName}`);
  }
}

async function handleResolveLibraryId(
  args: { libraryName: string },
  userId: string
) {
  const libraryName = requireString(args, "libraryName");
  if (!libraryName) {
    return errorResult("libraryName is required.");
  }

  const db = createDb(env.DB);
  const accessFilter = or(
    eq(schema.libraries.ownerId, userId),
    eq(schema.libraries.isPublic, 1)
  );

  let results = await db
    .select({
      id: schema.libraries.id,
      name: schema.libraries.name,
      version: schema.libraries.version,
    })
    .from(schema.libraries)
    .where(
      and(
        or(
          eq(schema.libraries.id, libraryName),
          eq(schema.libraries.name, libraryName)
        ),
        accessFilter
      )
    )
    .limit(10);

  if (results.length === 0) {
    const escaped = escapeLike(libraryName);
    results = await db
      .select({
        id: schema.libraries.id,
        name: schema.libraries.name,
        version: schema.libraries.version,
      })
      .from(schema.libraries)
      .where(
        and(
          or(
            like(schema.libraries.name, `%${escaped}%`),
            like(schema.libraries.id, `%${escaped}%`)
          ),
          accessFilter
        )
      )
      .limit(10);
  }

  if (results.length === 0) {
    return textResult(`No libraries found matching "${libraryName}".`);
  }

  const lines = results.map((lib) => {
    const version = lib.version ? ` v${lib.version}` : "";
    return `${lib.name}${version} → ${lib.id}`;
  });
  return textResult(lines.join("\n"));
}

async function handleQueryDocs(
  args: {
    libraryId: string;
    query: string;
    topic?: string;
    maxTokens?: number;
  },
  userId: string
) {
  const libraryId = requireString(args, "libraryId");
  const query = requireString(args, "query");
  if (!libraryId || !query) {
    return errorResult("libraryId and query are required.");
  }

  const topic = requireString(args, "topic");
  const fullQuery = topic ? `${topic}: ${query}` : query;
  const rawBudget =
    typeof args.maxTokens === "number" ? args.maxTokens : 3000;
  const budget = Math.max(1, Math.min(rawBudget, MAX_TOKEN_BUDGET));
  const topK = 5;

  const db = createDb(env.DB);

  const [library] = await db
    .select({
      ownerId: schema.libraries.ownerId,
      isPublic: schema.libraries.isPublic,
    })
    .from(schema.libraries)
    .where(eq(schema.libraries.id, libraryId))
    .limit(1);

  if (!library) return textResult(`Library "${libraryId}" not found.`);
  if (library.ownerId !== userId && library.isPublic !== 1) {
    return errorResult("Access denied.");
  }

  // Try semantic search via Vectorize
  try {
    const queryEmbedding = await generateEmbedding(fullQuery);
    let matches: any[] = [];
    try {
      matches = await queryVectors(queryEmbedding, {
        topK,
        filter: { libraryId },
      });
    } catch {
      /* filter may not be supported */
    }

    if (matches.length === 0) {
      const allMatches = await queryVectors(queryEmbedding, {
        topK: Math.max(topK * 10, 50),
      });
      matches = allMatches
        .filter((m: any) => m.metadata?.libraryId === libraryId)
        .slice(0, topK);
    }

    if (matches.length > 0) {
      const chunkIds = matches
        .map((m: any) => m.metadata?.chunkId as string)
        .filter(Boolean);
      const chunkResults = await db
        .select()
        .from(schema.chunks)
        .where(inArray(schema.chunks.id, chunkIds));

      const chunkMap = new Map(chunkResults.map((c) => [c.id, c]));
      const orderedChunks = chunkIds
        .map((id) => chunkMap.get(id))
        .filter(Boolean)
        .map((c) => ({
          title: c!.title,
          content: c!.content,
          url: c!.url,
        }));

      if (orderedChunks.length > 0) {
        const text = budgetChunks(orderedChunks, budget);
        const footer = formatSourceFooter(orderedChunks);
        return textResult(text + footer);
      }
    }
  } catch (e) {
    console.warn("Vectorize search failed, falling back:", e);
  }

  // Fallback: text search in D1
  const fallbackChunks = await db
    .select()
    .from(schema.chunks)
    .where(eq(schema.chunks.libraryId, libraryId))
    .limit(200);

  const queryLower = fullQuery.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(Boolean);
  const scored = fallbackChunks
    .map((c) => {
      const text = `${c.title ?? ""} ${c.content}`.toLowerCase();
      const termMatches = queryTerms.filter((t) =>
        text.includes(t)
      ).length;
      return { chunk: c, score: termMatches };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => ({
      title: s.chunk.title,
      content: s.chunk.content,
      url: s.chunk.url,
    }));

  if (scored.length === 0) {
    return textResult(
      `No documentation found for "${query}" in library "${libraryId}".`
    );
  }

  const text = budgetChunks(scored, budget);
  const footer = formatSourceFooter(scored);
  return textResult(text + footer);
}

async function handleLookupDocs(
  args: { libraryName: string; query: string; maxTokens?: number },
  userId: string
) {
  const libraryName = requireString(args, "libraryName");
  const query = requireString(args, "query");
  if (!libraryName || !query) {
    return errorResult("libraryName and query are required.");
  }

  const rawBudget =
    typeof args.maxTokens === "number" ? args.maxTokens : 3000;
  const budget = Math.max(1, Math.min(rawBudget, MAX_TOKEN_BUDGET));

  const db = createDb(env.DB);
  const accessFilter = or(
    eq(schema.libraries.ownerId, userId),
    eq(schema.libraries.isPublic, 1)
  );

  let results = await db
    .select({
      id: schema.libraries.id,
      name: schema.libraries.name,
      version: schema.libraries.version,
    })
    .from(schema.libraries)
    .where(
      and(
        or(
          eq(schema.libraries.id, libraryName),
          eq(schema.libraries.name, libraryName)
        ),
        accessFilter
      )
    )
    .limit(1);

  if (results.length === 0) {
    const escaped = escapeLike(libraryName);
    results = await db
      .select({
        id: schema.libraries.id,
        name: schema.libraries.name,
        version: schema.libraries.version,
      })
      .from(schema.libraries)
      .where(
        and(
          or(
            like(schema.libraries.name, `%${escaped}%`),
            like(schema.libraries.id, `%${escaped}%`)
          ),
          accessFilter
        )
      )
      .limit(1);
  }

  if (results.length === 0) {
    return textResult(
      `No libraries found matching "${libraryName}".`
    );
  }

  const library = results[0];
  const version = library.version ? ` v${library.version}` : "";
  const header = `[${library.id}] ${library.name}${version}\n\n`;

  const queryResult = await handleQueryDocs(
    { libraryId: library.id, query, maxTokens: budget },
    userId
  );

  if (queryResult.content?.[0]?.text) {
    queryResult.content[0].text =
      header + queryResult.content[0].text;
  }
  return queryResult;
}

async function handleInitProject(
  args: {
    projectName: string;
    description?: string;
    version?: string;
  },
  userId: string,
  sessionId: string
) {
  const projectName = requireString(args, "projectName");
  if (!projectName) {
    return errorResult("projectName is required.");
  }

  const description = requireString(args, "description", 1000);
  const version = requireString(args, "version", 64);

  const slug = version
    ? `${slugify(projectName)}-${slugify(version)}`
    : slugify(projectName);
  const libraryId = `project:${slug}`;

  const state = await getSession(sessionId, userId);
  state.project = {
    libraryId,
    name: projectName,
    description: description ?? undefined,
    version: version ?? undefined,
  };
  state.chunks = [];
  state.dirty = false;

  // Re-hydrate existing chunks from D1 — fail explicitly on error
  const db = createDb(env.DB);
  const [existingLib] = await db
    .select({ ownerId: schema.libraries.ownerId })
    .from(schema.libraries)
    .where(eq(schema.libraries.id, libraryId))
    .limit(1);

  // Only re-hydrate if the library belongs to this user
  if (existingLib && existingLib.ownerId === userId) {
    const chunkList = await db
      .select({
        id: schema.chunks.id,
        title: schema.chunks.title,
        tokenCount: schema.chunks.tokenCount,
      })
      .from(schema.chunks)
      .where(eq(schema.chunks.libraryId, libraryId))
      .limit(MAX_SESSION_CHUNKS);

    for (const chunk of chunkList) {
      const suffix = chunk.id.startsWith(`${libraryId}:`)
        ? chunk.id.slice(libraryId.length + 1)
        : chunk.id;
      const colonIdx = suffix.indexOf(":");
      const category =
        colonIdx > 0 ? suffix.slice(0, colonIdx) : "feature";
      const chunkSlug =
        colonIdx > 0 ? suffix.slice(colonIdx + 1) : suffix;
      state.chunks.push({
        id: chunk.id,
        title: chunk.title ?? chunk.id,
        category,
        slug: chunkSlug,
        content: "",
        tokenCount: chunk.tokenCount ?? 0,
        lastUpdated: new Date().toISOString(),
      });
    }
  } else if (existingLib && existingLib.ownerId !== userId) {
    return errorResult(
      `Library "${libraryId}" is owned by another user. Choose a different project name.`
    );
  }

  await saveSession(sessionId, userId, state);

  const versionLabel = version ? ` v${version}` : "";
  const rehydrated = state.chunks.length;
  const status =
    rehydrated > 0
      ? `Re-hydrated ${rehydrated} existing chunks.`
      : "No existing docs — starting fresh.";

  return textResult(
    `Initialized ${libraryId} (${projectName}${versionLabel})\n${status}`
  );
}

async function handleDocumentFeature(
  args: {
    title: string;
    category: string;
    content: string;
    slug?: string;
  },
  userId: string,
  sessionId: string
) {
  const state = await getSession(sessionId, userId);
  if (!state.project) {
    return errorResult(
      "No project initialized. Call init-project first."
    );
  }

  const title = requireString(args, "title", 200);
  const category = requireString(args, "category", 64);
  if (!title || !category) {
    return errorResult("title and category are required.");
  }
  if (!VALID_CATEGORIES.has(category)) {
    return errorResult(
      `Invalid category "${category}". Must be one of: ${[...VALID_CATEGORIES].join(", ")}`
    );
  }

  const content =
    typeof args.content === "string"
      ? args.content.slice(0, MAX_CONTENT_LENGTH)
      : "";
  if (!content) {
    return errorResult("content is required.");
  }

  const slug = requireString(args, "slug", 128);
  const chunkSlug = slug ?? slugify(title);
  const chunkId = `${state.project.libraryId}:${category}:${chunkSlug}`;
  const tokenCount = estimateTokens(content);
  const isUpdate = state.chunks.some((c) => c.id === chunkId);

  // Enforce chunk limit (only count if adding a new one)
  if (
    !isUpdate &&
    state.chunks.length >= MAX_SESSION_CHUNKS
  ) {
    return errorResult(
      `Session limit reached (${MAX_SESSION_CHUNKS} chunks). Sync before adding more.`
    );
  }

  state.chunks = state.chunks.filter((c) => c.id !== chunkId);
  state.chunks.push({
    id: chunkId,
    title,
    category,
    slug: chunkSlug,
    content,
    tokenCount,
    lastUpdated: new Date().toISOString(),
  });
  state.dirty = true;
  await saveSession(sessionId, userId, state);

  return textResult(
    `${isUpdate ? "Updated" : "Created"}: ${title}\n` +
      `ID: ${chunkId}\n` +
      `~${tokenCount} tokens | ${state.chunks.length} total docs (unsynced)`
  );
}

async function handleRemoveDoc(
  args: { chunkId?: string; category?: string; slug?: string },
  userId: string,
  sessionId: string
) {
  const state = await getSession(sessionId, userId);
  if (!state.project) {
    return errorResult(
      "No project initialized. Call init-project first."
    );
  }

  const chunkId = requireString(args, "chunkId");
  const category = requireString(args, "category");
  const slug = requireString(args, "slug", 128);

  const resolvedId =
    chunkId ??
    (category && slug
      ? `${state.project.libraryId}:${category}:${slug}`
      : null);
  if (!resolvedId) {
    return errorResult(
      "Provide either chunkId or both category and slug."
    );
  }

  const chunk = state.chunks.find((c) => c.id === resolvedId);
  if (!chunk) {
    return errorResult(`Chunk not found: ${resolvedId}`);
  }

  state.chunks = state.chunks.filter((c) => c.id !== resolvedId);
  state.dirty = true;
  await saveSession(sessionId, userId, state);

  return textResult(
    `Removed: ${chunk.title} (${resolvedId}), ${state.chunks.length} remaining (unsynced)`
  );
}

async function handleListProjectDocs(
  args: { refresh?: boolean },
  userId: string,
  sessionId: string
) {
  const state = await getSession(sessionId, userId);
  if (!state.project) {
    return errorResult(
      "No project initialized. Call init-project first."
    );
  }

  if (args.refresh || state.chunks.length === 0) {
    const db = createDb(env.DB);
    const chunkList = await db
      .select({
        id: schema.chunks.id,
        title: schema.chunks.title,
        tokenCount: schema.chunks.tokenCount,
      })
      .from(schema.chunks)
      .where(eq(schema.chunks.libraryId, state.project.libraryId))
      .limit(MAX_SESSION_CHUNKS);

    state.chunks = chunkList.map((chunk) => {
      const suffix = chunk.id.startsWith(
        `${state.project!.libraryId}:`
      )
        ? chunk.id.slice(state.project!.libraryId.length + 1)
        : chunk.id;
      const colonIdx = suffix.indexOf(":");
      const category =
        colonIdx > 0 ? suffix.slice(0, colonIdx) : "feature";
      const chunkSlug =
        colonIdx > 0 ? suffix.slice(colonIdx + 1) : suffix;
      return {
        id: chunk.id,
        title: chunk.title ?? chunk.id,
        category,
        slug: chunkSlug,
        content: "",
        tokenCount: chunk.tokenCount ?? 0,
        lastUpdated: new Date().toISOString(),
      };
    });
    await saveSession(sessionId, userId, state);
  }

  if (state.chunks.length === 0) {
    return textResult(`${state.project.libraryId} has no docs yet.`);
  }

  const lines = state.chunks.map(
    (c) =>
      `[${c.category}] ${c.title} (~${c.tokenCount} tok) ${c.id}`
  );
  const dirtyHint = state.dirty ? " (unsynced changes)" : "";
  return textResult(
    `${state.project.libraryId} (${state.project.name}) — ${state.chunks.length} docs${dirtyHint}\n` +
      lines.join("\n")
  );
}

async function handleSyncProjectDocs(
  userId: string,
  sessionId: string
) {
  const state = await getSession(sessionId, userId);
  if (!state.project) {
    return errorResult(
      "No project initialized. Call init-project first."
    );
  }

  const chunksWithContent = state.chunks.filter(
    (c) => c.content.length > 0
  );

  if (!state.dirty) {
    return textResult(
      `Already in sync. ${state.chunks.length} docs up to date.`
    );
  }

  const db = createDb(env.DB);

  // Ownership check: if library exists, ensure this user owns it
  const [existingLib] = await db
    .select({
      ownerId: schema.libraries.ownerId,
    })
    .from(schema.libraries)
    .where(eq(schema.libraries.id, state.project.libraryId))
    .limit(1);

  if (existingLib && existingLib.ownerId !== userId) {
    return errorResult(
      "This library is owned by another user. You cannot sync to it."
    );
  }

  try {
    if (chunksWithContent.length === 0) {
      // Only delete if we own it
      if (existingLib) {
        await db
          .delete(schema.chunks)
          .where(
            eq(schema.chunks.libraryId, state.project.libraryId)
          );
        await db
          .delete(schema.libraries)
          .where(eq(schema.libraries.id, state.project.libraryId));
        try {
          await deleteVectorsByLibrary(state.project.libraryId);
        } catch (e) {
          console.warn("Vector cleanup failed:", e);
        }
      }
      state.dirty = false;
      await saveSession(sessionId, userId, state);
      return textResult(
        `Deleted ${state.project.libraryId} (all docs removed)`
      );
    }

    // Clear existing data (only if library exists and we own it)
    if (existingLib) {
      await db
        .delete(schema.chunks)
        .where(eq(schema.chunks.libraryId, state.project.libraryId));
      try {
        await deleteVectorsByLibrary(state.project.libraryId);
      } catch (e) {
        console.warn("Vector cleanup failed:", e);
      }
    }

    // Upsert library
    if (existingLib) {
      await db
        .update(schema.libraries)
        .set({
          name: state.project.name,
          description: state.project.description,
          version: state.project.version,
          chunkCount: chunksWithContent.length,
          isPublic: 0,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(schema.libraries.id, state.project.libraryId),
            eq(schema.libraries.ownerId, userId)
          )
        );
    } else {
      await db.insert(schema.libraries).values({
        id: state.project.libraryId,
        name: state.project.name,
        description: state.project.description,
        version: state.project.version,
        chunkCount: chunksWithContent.length,
        ownerId: userId,
        isPublic: 0,
      });
    }

    // Insert chunks in batches
    const chunkValues = chunksWithContent.map((c) => ({
      id: c.id,
      libraryId: state.project!.libraryId,
      title: c.title,
      content: c.content,
      url: null,
      tokenCount: c.tokenCount,
    }));

    for (let i = 0; i < chunkValues.length; i += 10) {
      const batch = chunkValues.slice(i, i + 10);
      await db.insert(schema.chunks).values(batch);
    }

    // Generate embeddings
    let vectorized = false;
    if (chunksWithContent.length <= 50) {
      try {
        const texts = chunksWithContent.map((c) =>
          `${c.title}: ${c.content}`.slice(0, 2000)
        );
        const embeddings = await generateEmbeddings(texts);
        const vectors = chunksWithContent.map((c, j) => ({
          id: c.id,
          values: embeddings[j],
          metadata: {
            chunkId: c.id,
            libraryId: state.project!.libraryId,
            title: c.title,
          },
        }));
        await upsertVectors(vectors);
        vectorized = true;
      } catch (e) {
        console.warn("Embedding failed:", e);
      }
    }

    await invalidateLibrary(state.project.libraryId);

    // Backup to R2
    try {
      await env.DOCS_BUCKET.put(
        `${state.project.libraryId}/chunks.json`,
        JSON.stringify(chunksWithContent)
      );
    } catch {
      /* non-critical */
    }

    state.dirty = false;
    await saveSession(sessionId, userId, state);

    return textResult(
      `Synced ${chunksWithContent.length} chunks to ${state.project.libraryId}\n` +
        `Vectorized: ${vectorized}`
    );
  } catch (e: any) {
    console.error("Sync error:", e);
    return errorResult("Sync failed. Please try again.");
  }
}

// --- Main Handler ---

export async function handleMcpRequest(
  request: Request,
  userId: string
): Promise<Response> {
  // Validate session ID format
  let sessionId = request.headers.get("mcp-session-id");
  if (sessionId) {
    // Sanitize: only allow alphanumeric, hyphens, and limit length
    if (
      sessionId.length > MAX_SESSION_ID_LENGTH ||
      !/^[a-zA-Z0-9-]+$/.test(sessionId)
    ) {
      sessionId = crypto.randomUUID();
    }
  } else {
    sessionId = crypto.randomUUID();
  }

  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      },
      { status: 400 }
    );
  }

  // Validate basic JSON-RPC structure
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    body.jsonrpc !== "2.0"
  ) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32600,
          message: "Invalid JSON-RPC request",
        },
        id: null,
      },
      { status: 400 }
    );
  }

  // Handle notifications (no id = notification, return 202)
  if (body.id === undefined || body.id === null) {
    return new Response(null, {
      status: 202,
      headers: { "Mcp-Session-Id": sessionId },
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Mcp-Session-Id": sessionId,
  };

  let result: any;
  switch (body.method) {
    case "initialize":
      result = {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "jeremy",
          version: "1.0.0",
        },
      };
      break;

    case "tools/list":
      result = { tools: TOOLS };
      break;

    case "tools/call": {
      const toolName = body.params?.name;
      const toolArgs = body.params?.arguments ?? {};
      if (typeof toolName !== "string" || !toolName) {
        return Response.json(
          {
            jsonrpc: "2.0",
            id: body.id,
            error: {
              code: -32602,
              message: "Missing or invalid tool name",
            },
          },
          { headers }
        );
      }
      result = await handleToolCall(
        toolName,
        toolArgs,
        userId,
        sessionId
      );
      break;
    }

    default:
      return Response.json(
        {
          jsonrpc: "2.0",
          id: body.id,
          error: {
            code: -32601,
            message: "Method not found",
          },
        },
        { headers }
      );
  }

  return Response.json(
    { jsonrpc: "2.0", id: body.id, result },
    { headers }
  );
}
