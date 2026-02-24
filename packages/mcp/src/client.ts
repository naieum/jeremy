export interface Library {
  id: string;
  name: string;
  description?: string;
  version?: string;
}

export interface DocChunk {
  id: string;
  title: string;
  content: string;
  url?: string;
  tokenCount?: number;
}

export interface SearchResponse {
  libraries: Library[];
}

export interface ContextResponse {
  chunks: DocChunk[];
}

export interface IngestChunk {
  id: string;
  title?: string;
  content: string;
  url?: string;
  tokenCount?: number;
}

export interface IngestOptions {
  libraryId: string;
  name: string;
  description?: string;
  version?: string;
  chunks: IngestChunk[];
  replace?: boolean;
  skipEmbeddings?: boolean;
}

export interface IngestResponse {
  success: boolean;
  libraryId: string;
  chunksIngested: number;
  vectorized: boolean;
}

export class JeremyClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        throw new Error(`Rate limited (429)${retryAfter ? `, retry after ${retryAfter}s` : ""}`);
      }
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`API ${response.status}: ${text}`);
    }
    return response.json() as Promise<T>;
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    return this.handleResponse<T>(response);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return this.handleResponse<T>(response);
  }

  private async del<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    return this.handleResponse<T>(response);
  }

  async search(libraryName: string, query?: string, version?: string): Promise<SearchResponse> {
    const params: Record<string, string> = { libraryName };
    if (query !== undefined) {
      params.query = query;
    }
    if (version !== undefined) {
      params.version = version;
    }
    return this.get<SearchResponse>("/api/search", params);
  }

  async getContext(
    libraryId: string,
    query: string,
    options?: { topK?: number; maxTokens?: number }
  ): Promise<ContextResponse> {
    const params: Record<string, string> = { libraryId, query };
    if (options?.topK !== undefined) {
      params.topK = String(options.topK);
    }
    if (options?.maxTokens !== undefined) {
      params.maxTokens = String(options.maxTokens);
    }
    return this.get<ContextResponse>("/api/context", params);
  }

  async queryByName(
    libraryName: string,
    query: string,
    options?: { topK?: number; maxTokens?: number }
  ): Promise<ContextResponse & { libraryId?: string; library?: Library }> {
    const searchResult = await this.search(libraryName);
    if (!searchResult.libraries || searchResult.libraries.length === 0) {
      return { chunks: [] };
    }
    const library = searchResult.libraries[0];
    const context = await this.getContext(library.id, query, options);
    return { ...context, libraryId: library.id, library };
  }

  async ingest(options: IngestOptions): Promise<IngestResponse> {
    return this.post<IngestResponse>("/api/ingest", options);
  }

  async deleteLibrary(libraryId: string): Promise<{ success: boolean }> {
    return this.del<{ success: boolean }>(`/api/libraries/${encodeURIComponent(libraryId)}`);
  }

  async getLibrary(libraryId: string): Promise<{
    library: Library;
    chunks: Array<{ id: string; title?: string; url?: string; tokenCount?: number }>;
    total: number;
    hasMore: boolean;
  }> {
    return this.get(`/api/libraries/${encodeURIComponent(libraryId)}`, { limit: "500" });
  }
}
