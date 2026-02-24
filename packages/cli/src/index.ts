#!/usr/bin/env node
import { randomUUID } from "crypto";
import { Command } from "commander";
import { buildHeaders, getConfigValue, getEndpoint, setConfigValue } from "./config.js";
import { chunkText } from "./chunk.js";
import { crawlUrl } from "./crawl.js";
import { fetchLlmsTxt } from "./llms-txt.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IngestChunk {
  id: string;
  content: string;
  tokenCount: number;
  metadata: {
    title: string;
    url: string;
    chunkIndex: number;
  };
}

interface IngestPayload {
  libraryId: string;
  name: string;
  sourceUrl?: string;
  chunks: IngestChunk[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postIngest(payload: IngestPayload): Promise<void> {
  const endpoint = await getEndpoint();
  const headers = await buildHeaders();

  const response = await fetch(`${endpoint}/api/ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Ingest failed (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`,
    );
  }
}

function buildChunks(
  docs: Array<{ title: string; content: string; url: string }>,
): IngestChunk[] {
  const allChunks: IngestChunk[] = [];

  for (const doc of docs) {
    const textChunks = chunkText(doc.content);
    textChunks.forEach((chunk, index) => {
      allChunks.push({
        id: randomUUID(),
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        metadata: {
          title: doc.title,
          url: doc.url,
          chunkIndex: index,
        },
      });
    });
  }

  return allChunks;
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("jeremy")
  .description("CLI for the Jeremy self-hosted documentation RAG system")
  .version("1.0.0");

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

const addCommand = program
  .command("add")
  .description("Ingest a library into Jeremy")
  .requiredOption("--name <name>", "Human-readable library name")
  .requiredOption("--id <id>", "Unique library ID (slug)")
  .option("--llms-txt <url>", "URL of an llms.txt file to ingest")
  .option("--url <url>", "URL of a single page to crawl and ingest")
  .action(async (options: { name: string; id: string; llmsTxt?: string; url?: string }) => {
    const { name, id, llmsTxt, url } = options;

    if (!llmsTxt && !url) {
      console.error("Error: You must provide either --llms-txt or --url.");
      process.exit(1);
    }

    if (llmsTxt && url) {
      console.error("Error: Provide either --llms-txt or --url, not both.");
      process.exit(1);
    }

    try {
      let docs: Array<{ title: string; content: string; url: string }>;
      let sourceUrl: string;

      if (llmsTxt) {
        sourceUrl = llmsTxt;
        docs = await fetchLlmsTxt(llmsTxt);
      } else {
        sourceUrl = url!;
        console.log(`Crawling ${url}...`);
        const result = await crawlUrl(url!);
        docs = [result];
      }

      if (docs.length === 0) {
        console.error("Error: No content could be retrieved.");
        process.exit(1);
      }

      console.log(`Chunking content from ${docs.length} document(s)...`);
      const chunks = buildChunks(docs);
      console.log(`Generated ${chunks.length} chunk(s). Posting to /api/ingest...`);

      const payload: IngestPayload = {
        libraryId: id,
        name,
        sourceUrl,
        chunks,
      };

      await postIngest(payload);
      console.log(`Successfully ingested library "${name}" (id: ${id}) with ${chunks.length} chunk(s).`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// Suppress unused variable warning — addCommand is used for its side effects
// (registering with the program). The reference ensures TypeScript keeps it.
void addCommand;

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

program
  .command("list")
  .description("List all ingested libraries")
  .action(async () => {
    try {
      const endpoint = await getEndpoint();
      const headers = await buildHeaders();

      const response = await fetch(`${endpoint}/api/search?q=`, {
        headers,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Request failed (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`,
        );
      }

      const data = (await response.json()) as unknown;

      // Accept either a top-level array or { libraries: [...] }
      let libraries: unknown[];
      if (Array.isArray(data)) {
        libraries = data;
      } else if (
        typeof data === "object" &&
        data !== null &&
        "libraries" in data &&
        Array.isArray((data as Record<string, unknown>).libraries)
      ) {
        libraries = (data as Record<string, unknown>).libraries as unknown[];
      } else {
        // Just pretty-print whatever we got.
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      if (libraries.length === 0) {
        console.log("No libraries found.");
        return;
      }

      console.log(`Found ${libraries.length} library/libraries:\n`);
      for (const lib of libraries) {
        if (typeof lib === "object" && lib !== null) {
          const l = lib as Record<string, unknown>;
          const idStr = l.id ? `  id:   ${l.id}` : "";
          const nameStr = l.name ? `  name: ${l.name}` : "";
          const srcStr = l.sourceUrl ? `  src:  ${l.sourceUrl}` : "";
          console.log([idStr, nameStr, srcStr].filter(Boolean).join("\n"));
          console.log();
        } else {
          console.log(String(lib));
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------

program
  .command("refresh")
  .description("Re-ingest a library by fetching its source URL again")
  .requiredOption("--id <id>", "Library ID to refresh")
  .action(async (options: { id: string }) => {
    const { id } = options;

    try {
      const endpoint = await getEndpoint();
      const headers = await buildHeaders();

      // First, look up the library to get its source URL and name.
      const getResponse = await fetch(`${endpoint}/api/libraries/${id}`, {
        headers,
      });

      if (!getResponse.ok) {
        if (getResponse.status === 404) {
          throw new Error(`Library with id "${id}" not found.`);
        }
        const body = await getResponse.text().catch(() => "");
        throw new Error(
          `Failed to retrieve library (${getResponse.status} ${getResponse.statusText})${body ? `: ${body}` : ""}`,
        );
      }

      const library = (await getResponse.json()) as Record<string, unknown>;
      const { name, sourceUrl } = library;

      if (typeof sourceUrl !== "string" || !sourceUrl) {
        throw new Error(
          `Library "${id}" has no stored source URL. Re-ingest manually using "add".`,
        );
      }
      if (typeof name !== "string") {
        throw new Error(`Library "${id}" has no stored name.`);
      }

      console.log(`Refreshing library "${name}" (id: ${id}) from ${sourceUrl}...`);

      let docs: Array<{ title: string; content: string; url: string }>;

      // Detect whether the source URL is an llms.txt file.
      const isLlmsTxt =
        sourceUrl.endsWith("llms.txt") || sourceUrl.includes("llms.txt");

      if (isLlmsTxt) {
        docs = await fetchLlmsTxt(sourceUrl);
      } else {
        const result = await crawlUrl(sourceUrl);
        docs = [result];
      }

      if (docs.length === 0) {
        throw new Error("No content could be retrieved from the source URL.");
      }

      console.log(`Chunking content from ${docs.length} document(s)...`);
      const chunks = buildChunks(docs);
      console.log(`Generated ${chunks.length} chunk(s). Posting to /api/ingest...`);

      const payload: IngestPayload = {
        libraryId: id,
        name,
        sourceUrl,
        chunks,
      };

      await postIngest(payload);
      console.log(
        `Successfully refreshed library "${name}" (id: ${id}) with ${chunks.length} chunk(s).`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

program
  .command("delete")
  .description("Delete a library from Jeremy")
  .requiredOption("--id <id>", "Library ID to delete")
  .action(async (options: { id: string }) => {
    const { id } = options;

    try {
      const endpoint = await getEndpoint();
      const headers = await buildHeaders();

      const response = await fetch(`${endpoint}/api/libraries/${id}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Library with id "${id}" not found.`);
        }
        const body = await response.text().catch(() => "");
        throw new Error(
          `Delete failed (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`,
        );
      }

      console.log(`Library "${id}" deleted successfully.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

const configCommand = program
  .command("config")
  .description("Manage Jeremy CLI configuration");

configCommand
  .command("set <key> <value>")
  .description('Set a config value (keys: "endpoint", "api-key")')
  .action(async (key: string, value: string) => {
    const validKeys = ["endpoint", "api-key"] as const;
    type ValidKey = (typeof validKeys)[number];

    if (!validKeys.includes(key as ValidKey)) {
      console.error(
        `Error: Unknown config key "${key}". Valid keys: ${validKeys.join(", ")}.`,
      );
      process.exit(1);
    }

    try {
      await setConfigValue(key as ValidKey, value);
      console.log(`Config "${key}" set to "${value}".`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

configCommand
  .command("get <key>")
  .description('Get a config value (keys: "endpoint", "api-key")')
  .action(async (key: string) => {
    const validKeys = ["endpoint", "api-key"] as const;
    type ValidKey = (typeof validKeys)[number];

    if (!validKeys.includes(key as ValidKey)) {
      console.error(
        `Error: Unknown config key "${key}". Valid keys: ${validKeys.join(", ")}.`,
      );
      process.exit(1);
    }

    try {
      const value = await getConfigValue(key as ValidKey);
      console.log(value);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

program.parse(process.argv);
