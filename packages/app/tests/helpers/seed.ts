import type { APIRequestContext } from "@playwright/test";

interface ChunkData {
  id: string;
  title?: string;
  content: string;
  url?: string;
  tokenCount?: number;
}

interface SeedLibraryOptions {
  libraryId: string;
  name: string;
  description?: string;
  chunks: ChunkData[];
  skipEmbeddings?: boolean;
  replace?: boolean;
  sourceType?: string;
  sourceUrl?: string;
  version?: string;
}

/**
 * Seed a library via /api/ingest. Requires admin API key or session auth.
 */
export async function seedLibrary(
  request: APIRequestContext,
  apiKeyOrHeaders: string | Record<string, string>,
  options: SeedLibraryOptions
): Promise<{ success: boolean; libraryId: string; chunksIngested: number }> {
  const headers: Record<string, string> =
    typeof apiKeyOrHeaders === "string"
      ? { Authorization: `Bearer ${apiKeyOrHeaders}` }
      : apiKeyOrHeaders;

  const res = await request.post("/api/ingest", {
    headers,
    data: {
      libraryId: options.libraryId,
      name: options.name,
      description: options.description ?? "",
      sourceUrl: options.sourceUrl ?? "",
      sourceType: options.sourceType ?? "manual",
      version: options.version ?? "1.0.0",
      chunks: options.chunks,
      replace: options.replace ?? false,
      skipEmbeddings: options.skipEmbeddings ?? true,
    },
  });

  return res.json();
}

/**
 * Create an API key via /api/keys. Requires session auth (cookies).
 */
export async function createApiKey(
  request: APIRequestContext,
  name: string,
  permissions: "read" | "admin" = "read"
): Promise<{ id: string; key: string; keyPrefix: string; permissions: string }> {
  const res = await request.post("/api/keys", {
    data: { name, permissions },
  });

  return res.json();
}
