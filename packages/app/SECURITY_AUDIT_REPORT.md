# Security Audit Report

**Project:** Jeremy App (`packages/app`)
**Date:** 2026-02-22
**Scan Type:** Quick Scan (Categories: 1, 2, 3, 4, 5, 15, 17, 28)

## Summary

- **Overall Risk:** Critical
- **Findings:** 3 Critical, 2 High, 3 Medium, 1 Low

---

## Critical Findings

### 1. Unauthenticated Library DELETE — No Auth, No Ownership Check

- **File:** `src/routes/api/libraries/$id.ts:7-8`
- **Evidence:**
  ```typescript
  GET: async ({ params }) => handleGetLibrary(params.id),
  DELETE: async ({ params }) => handleDeleteLibrary(params.id),
  ```
  Handler at `src/server/api/libraries.ts:37-58`:
  ```typescript
  export async function handleDeleteLibrary(id: string): Promise<Response> {
    const db = createDb(env.DB);
    const [library] = await db.select().from(schema.libraries)
      .where(eq(schema.libraries.id, id)).limit(1);
    if (!library) {
      return Response.json({ error: "Library not found" }, { status: 404 });
    }
    await db.delete(schema.chunks).where(eq(schema.chunks.libraryId, id));
    await db.delete(schema.libraries).where(eq(schema.libraries.id, id));
    // ... no auth, no ownership check
  }
  ```
- **Risk:** Any unauthenticated user can delete any library and its chunks by knowing its ID. Denial of service on the entire dataset.
- **Fix:** Add session/API key auth at the route level and verify `library.ownerId === userId` before deletion.

### 2. SSRF — Arbitrary URL Fetch Without Validation

- **File:** `src/server/api/ingest-url.ts:30-35`
- **Evidence:**
  ```typescript
  if (sourceType === "llms_txt" || sourceUrl.includes("llms")) {
    docs = await fetchLlmsTxt(sourceUrl);
  } else {
    const res = await fetch(sourceUrl);  // No URL validation
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    const content = await res.text();
  }
  ```
  Also in `src/server/lib/llms-txt.ts:24,36`:
  ```typescript
  const res = await fetch(llmsTxtUrl);       // Initial URL not validated
  // ...
  const r = await fetch(entry.url);          // URLs parsed from file not validated
  ```
- **Risk:** Authenticated users can fetch internal IPs (127.0.0.1, 169.254.169.254 metadata service), scan internal ports, or chain SSRF via crafted llms.txt files containing internal URLs.
- **Fix:** Implement URL validation: allowlist protocols (http/https only), block private IP ranges and metadata endpoints, validate hostnames before fetching.

### 3. IDOR — Library Update Without Ownership Verification

- **File:** `src/server/api/ingest-url.ts:43-57`
- **Evidence:**
  ```typescript
  const [existing] = await db.select().from(schema.libraries)
    .where(eq(schema.libraries.id, libraryId)).limit(1);

  if (existing) {
    // Updates library without checking existing.ownerId === ownerId
    await db.delete(schema.chunks).where(eq(schema.chunks.libraryId, libraryId));
    await db.update(schema.libraries).set({
      name, description, sourceUrl, sourceType: sourceType || "llms_txt",
      chunkCount: chunks.length, updatedAt: new Date().toISOString(),
    }).where(eq(schema.libraries.id, libraryId));
  }
  ```
- **Risk:** Any authenticated user can overwrite another user's library by POSTing to `/api/ingest-url` with that library's ID, replacing all content and metadata.
- **Fix:** Check `existing.ownerId === ownerId` before updating. Return 403 if not the owner.

---

## High Findings

### 4. Unauthenticated Library List and GET Endpoints

- **File:** `src/routes/api/libraries/index.ts:4-8`
- **Evidence:**
  ```typescript
  GET: async () => handleListLibraries(),  // No auth
  ```
  Handler at `src/server/api/libraries.ts:6-10`:
  ```typescript
  export async function handleListLibraries(): Promise<Response> {
    const db = createDb(env.DB);
    const results = await db.select().from(schema.libraries);
    return Response.json({ libraries: results });
  }
  ```
- **Risk:** Unauthenticated information disclosure of all library names, IDs, source URLs, descriptions, and chunk counts. The GET-by-ID endpoint also returns all chunk metadata without auth.
- **Fix:** Require auth. If libraries should be publicly discoverable, add an `isPublic` filter. Otherwise require session or API key.

### 5. No Rate Limiting on AI Endpoints

- **File:** `src/server/lib/ai.ts:40-47`, `src/server/lib/embeddings.ts:22-38`
- **Evidence:**
  ```typescript
  // ai.ts — no rate limiting
  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    max_tokens: 512,
  });
  ```
  ```typescript
  // embeddings.ts — batches but no rate limiting
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const result = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: batch });
    allEmbeddings.push(...result.data);
  }
  ```
- **Risk:** An authenticated user could make unlimited AI/embedding calls, consuming Workers AI quota and potentially incurring costs. The chat endpoint (admin-only) and embedding generation (any authenticated user via ingest) have no throttling.
- **Fix:** Add per-user rate limiting on AI-consuming endpoints. Consider using Cloudflare's built-in rate limiting or KV-based counters.

---

## Medium Findings

### 6. Internal Error Messages Exposed to Users

- **File:** `src/server/api/chat.ts:73-78`
- **Evidence:**
  ```typescript
  } catch (e: any) {
    return Response.json({
      role: "assistant",
      content: `Failed to ingest **${spec.name}**: ${e.message}`,
    });
  }
  ```
- **Risk:** Raw error messages may reveal internal implementation details (database errors, API limits, stack traces) that help attackers understand system architecture.
- **Fix:** Log full errors server-side. Return a generic message to clients.

### 7. Prompt Injection Risk in AI Chat

- **File:** `src/server/lib/ai.ts:40-47`
- **Evidence:**
  ```typescript
  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },  // Unsanitized user input
    ],
  });
  ```
- **Risk:** While admin-only, a prompt injection attack could trick the LLM into returning crafted JSON that ingests from unintended URLs or sets misleading metadata. The model output is parsed as JSON and used to drive the ingest pipeline.
- **Fix:** Validate extracted fields (e.g., URL format, ID format) after LLM extraction. Add input length limits. Consider output validation against a schema.

### 8. ADMIN_USER_ID in Plaintext Config

- **File:** `wrangler.jsonc:16`
- **Evidence:**
  ```jsonc
  "vars": {
    "BASE_URL": "https://jeremy-app.ian-muench.workers.dev",
    "ADMIN_USER_ID": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  }
  ```
- **Risk:** If the repository becomes public, the admin user ID is exposed. While not a cryptographic secret, it reveals which user has elevated privileges.
- **Fix:** Move `ADMIN_USER_ID` to Cloudflare secret environment variables (`wrangler secret put ADMIN_USER_ID`).

---

## Low Findings

### 9. Host Header Used for Auth Base URL

- **File:** `src/server/api/chat.ts:12`
- **Evidence:**
  ```typescript
  const origin = new URL(request.url).origin;
  const auth = createAuth(env as any, origin);
  ```
  And `src/server/auth.ts:18`:
  ```typescript
  const baseURL = requestOrigin || env.BASE_URL;
  ```
- **Risk:** In theory, a manipulated Host header could influence the `baseURL` used for auth. In practice, Cloudflare Workers normalizes request URLs, mitigating this risk.
- **Fix:** Prefer using `env.BASE_URL` directly instead of deriving from request origin.

---

## Passed Checks

- [x] No SQL injection found — Drizzle ORM parameterized queries used throughout (Category 1)
- [x] No XSS vulnerabilities — React automatic escaping, no unsafe HTML rendering (Category 2)
- [x] No hardcoded API keys or passwords in source code — all secrets via env vars (Category 3)
- [x] Chat endpoint properly admin-gated with session + ADMIN_USER_ID check (Category 4)
- [x] API key management has proper ownership checks (Category 28)
- [x] API keys stored as SHA-256 hashes, generated with crypto.getRandomValues (Category 17)
- [x] Database uses Drizzle ORM with parameterized queries — no raw SQL (Category 17)
- [x] Cron endpoint properly authenticated with Bearer secret (Category 4)
