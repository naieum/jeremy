import type { APIRequestContext } from "@playwright/test";

/**
 * Typed wrapper around Playwright's APIRequestContext for Jeremy API calls.
 */
export class ApiClient {
  constructor(
    private request: APIRequestContext,
    private apiKey?: string
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  // --- Search & Context ---

  async search(params: { libraryName: string; query?: string }) {
    const qs = new URLSearchParams({ libraryName: params.libraryName });
    if (params.query) qs.set("query", params.query);
    return this.request.get(`/api/search?${qs}`, { headers: this.headers() });
  }

  async context(params: {
    libraryId: string;
    query: string;
    topK?: number;
    maxTokens?: number;
  }) {
    const qs = new URLSearchParams({
      libraryId: params.libraryId,
      query: params.query,
    });
    if (params.topK) qs.set("topK", String(params.topK));
    if (params.maxTokens) qs.set("maxTokens", String(params.maxTokens));
    return this.request.get(`/api/context?${qs}`, { headers: this.headers() });
  }

  // --- Ingest ---

  async ingest(body: Record<string, unknown>) {
    return this.request.post("/api/ingest", {
      headers: this.headers(),
      data: body,
    });
  }

  // --- Libraries (session auth) ---

  async listLibraries() {
    return this.request.get("/api/libraries/");
  }

  async getLibrary(id: string, params?: { limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return this.request.get(`/api/libraries/${id}${query ? "?" + query : ""}`);
  }

  async deleteLibrary(id: string) {
    return this.request.delete(`/api/libraries/${id}`);
  }

  // --- API Keys (session auth) ---

  async listKeys() {
    return this.request.get("/api/keys");
  }

  async createKey(name: string, permissions: "read" | "admin" = "read") {
    return this.request.post("/api/keys", {
      data: { name, permissions },
    });
  }

  async deleteKey(id: string) {
    return this.request.delete(`/api/keys?id=${id}`);
  }

  // --- Repos (session auth) ---

  async getRepoConnection(libraryId: string) {
    return this.request.get(`/api/libraries/${libraryId}/repo`);
  }

  async connectRepo(libraryId: string, repoUrl: string) {
    return this.request.post(`/api/libraries/${libraryId}/repo`, {
      data: { repoUrl },
    });
  }

  async verifyRepo(
    libraryId: string,
    method: string,
    token?: string
  ) {
    return this.request.post(`/api/libraries/${libraryId}/repo/verify`, {
      data: { method, token },
    });
  }

  async ingestRepo(libraryId: string) {
    return this.request.post(`/api/libraries/${libraryId}/repo/ingest`);
  }

  async disconnectRepo(libraryId: string) {
    return this.request.delete(`/api/libraries/${libraryId}/repo`);
  }

  // --- Doc Sites (session auth) ---

  async getDocSite(libraryId: string) {
    return this.request.get(`/api/libraries/${libraryId}/docs`);
  }

  async createDocSite(libraryId: string, subdomain?: string) {
    return this.request.post(`/api/libraries/${libraryId}/docs`, {
      data: subdomain ? { subdomain } : {},
    });
  }

  async buildDocSite(libraryId: string) {
    return this.request.post(`/api/libraries/${libraryId}/docs/build`);
  }

  async deleteDocSite(libraryId: string) {
    return this.request.delete(`/api/libraries/${libraryId}/docs`);
  }

  // --- Admin (session auth) ---

  async adminListUsers(params?: { limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return this.request.get(`/api/admin/users${query ? "?" + query : ""}`);
  }

  async adminGetUser(userId: string) {
    return this.request.get(`/api/admin/users/${userId}`);
  }

  async adminSetFlag(
    userId: string,
    action: "add" | "remove",
    flag: string,
    reason?: string
  ) {
    return this.request.post(`/api/admin/users/${userId}/flags`, {
      data: { action, flag, reason },
    });
  }

  // --- Webhooks ---

  async githubWebhook(event: string, body: Record<string, unknown>, signature?: string) {
    const headers: Record<string, string> = {
      "X-GitHub-Event": event,
    };
    if (signature) {
      headers["X-Hub-Signature-256"] = signature;
    }
    return this.request.post("/api/webhooks/github", {
      headers,
      data: body,
    });
  }

  // --- Cron ---

  async cronRefresh(cronSecret: string) {
    return this.request.post("/api/cron/refresh", {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
  }
}
