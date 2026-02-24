import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "../middleware/api-auth";
import { createAuth } from "../auth";
import { fetchLlmsTxt, chunkDocs } from "../lib/llms-txt";
import { generateEmbeddings } from "../lib/embeddings";
import { upsertVectors, deleteVectorsByLibrary } from "../lib/vectorize";
import { invalidateLibrary } from "../lib/cache";

async function getSessionUserId(request: Request): Promise<string | null> {
  try {
    const origin = new URL(request.url).origin;
    const auth = createAuth(env as any, origin);
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function resolveUserId(request: Request): Promise<string | null> {
  const apiAuth = await validateApiKey(request, "admin");
  if (apiAuth) return apiAuth.userId;
  return getSessionUserId(request);
}

function parseGitHubUrl(url: string): { owner: string; name: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], name: parts[1].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

// POST /api/libraries/:id/repo — Connect a repo
export async function handleConnectRepo(
  request: Request,
  libraryId: string
): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { repoUrl: string };
  if (!body.repoUrl) {
    return Response.json({ error: "repoUrl is required" }, { status: 400 });
  }

  const parsed = parseGitHubUrl(body.repoUrl);
  if (!parsed) {
    return Response.json(
      { error: "Invalid GitHub URL. Expected: https://github.com/owner/repo" },
      { status: 400 }
    );
  }

  const db = createDb(env.DB);

  // Verify library exists and user owns it
  const [library] = await db
    .select()
    .from(schema.libraries)
    .where(
      and(
        eq(schema.libraries.id, libraryId),
        eq(schema.libraries.ownerId, userId)
      )
    )
    .limit(1);

  if (!library) {
    return Response.json({ error: "Library not found or not owned by you" }, { status: 404 });
  }

  // Validate GitHub repo exists
  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.name}`,
      { headers: { "User-Agent": "Jeremy-App", Accept: "application/vnd.github.v3+json" } }
    );
    if (!ghRes.ok) {
      return Response.json(
        { error: `GitHub repo not found: ${parsed.owner}/${parsed.name}` },
        { status: 400 }
      );
    }
  } catch (e: any) {
    return Response.json(
      { error: `Failed to validate GitHub repo: ${e.message}` },
      { status: 400 }
    );
  }

  // Check for existing connection
  const [existing] = await db
    .select()
    .from(schema.repoConnections)
    .where(eq(schema.repoConnections.libraryId, libraryId))
    .limit(1);

  if (existing) {
    // Update existing connection
    await db
      .update(schema.repoConnections)
      .set({
        repoUrl: body.repoUrl,
        repoOwner: parsed.owner,
        repoName: parsed.name,
        verifiedAt: null,
        verificationMethod: null,
        verificationToken: null,
      })
      .where(eq(schema.repoConnections.id, existing.id));

    return Response.json({
      id: existing.id,
      libraryId,
      repoUrl: body.repoUrl,
      repoOwner: parsed.owner,
      repoName: parsed.name,
      verified: false,
    });
  }

  // Create new connection
  const connectionId = crypto.randomUUID();
  await db.insert(schema.repoConnections).values({
    id: connectionId,
    libraryId,
    userId,
    repoUrl: body.repoUrl,
    repoOwner: parsed.owner,
    repoName: parsed.name,
  });

  return Response.json({
    id: connectionId,
    libraryId,
    repoUrl: body.repoUrl,
    repoOwner: parsed.owner,
    repoName: parsed.name,
    verified: false,
    verificationInstructions: {
      file: `Add a file named .jeremy-verify to the root of your repo. A verification token will be generated when you initiate file verification.`,
      pat: `Provide a GitHub Personal Access Token with repo write access.`,
      oauth: `Authenticate via GitHub OAuth to verify write access.`,
    },
  });
}

// POST /api/libraries/:id/repo/verify — Verify write access
export async function handleVerifyRepo(
  request: Request,
  libraryId: string
): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    method: "file" | "pat" | "oauth";
    token?: string;
  };

  if (!body.method) {
    return Response.json({ error: "method is required (file, pat, or oauth)" }, { status: 400 });
  }

  const db = createDb(env.DB);

  // Get connection
  const [connection] = await db
    .select()
    .from(schema.repoConnections)
    .where(
      and(
        eq(schema.repoConnections.libraryId, libraryId),
        eq(schema.repoConnections.userId, userId)
      )
    )
    .limit(1);

  if (!connection) {
    return Response.json({ error: "No repo connection found" }, { status: 404 });
  }

  const { repoOwner, repoName } = connection;

  if (body.method === "file") {
    // Generate or use existing verification token
    let token = connection.verificationToken;
    if (!token) {
      token = crypto.randomUUID();
      await db
        .update(schema.repoConnections)
        .set({ verificationToken: token, verificationMethod: "file" })
        .where(eq(schema.repoConnections.id, connection.id));
    }

    // Check if file exists in repo
    try {
      const ghRes = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/contents/.jeremy-verify`,
        { headers: { "User-Agent": "Jeremy-App", Accept: "application/vnd.github.v3+json" } }
      );

      if (!ghRes.ok) {
        return Response.json({
          verified: false,
          method: "file",
          token,
          instructions: `Add a file named .jeremy-verify to the root of ${repoOwner}/${repoName} with the content: ${token}`,
        });
      }

      const fileData = (await ghRes.json()) as { content?: string; encoding?: string };
      let fileContent = "";
      if (fileData.content && fileData.encoding === "base64") {
        fileContent = atob(fileData.content).trim();
      }

      if (fileContent !== token) {
        return Response.json({
          verified: false,
          method: "file",
          token,
          error: "File found but content does not match the verification token",
        });
      }

      // Verified!
      await db
        .update(schema.repoConnections)
        .set({
          verifiedAt: new Date().toISOString(),
          verificationMethod: "file",
        })
        .where(eq(schema.repoConnections.id, connection.id));

      return Response.json({ verified: true, method: "file" });
    } catch (e: any) {
      return Response.json({ error: `Verification failed: ${e.message}` }, { status: 500 });
    }
  }

  if (body.method === "pat") {
    if (!body.token) {
      return Response.json(
        { error: "token is required for PAT verification" },
        { status: 400 }
      );
    }

    try {
      const ghRes = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}`,
        {
          headers: {
            "User-Agent": "Jeremy-App",
            Authorization: `token ${body.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!ghRes.ok) {
        return Response.json(
          { verified: false, error: "PAT does not have access to this repo" },
          { status: 400 }
        );
      }

      const repoData = (await ghRes.json()) as { permissions?: { push?: boolean } };
      if (!repoData.permissions?.push) {
        return Response.json({
          verified: false,
          error: "PAT does not have write (push) access to this repo",
        });
      }

      // Verified! Do NOT store the PAT.
      await db
        .update(schema.repoConnections)
        .set({
          verifiedAt: new Date().toISOString(),
          verificationMethod: "pat",
        })
        .where(eq(schema.repoConnections.id, connection.id));

      return Response.json({ verified: true, method: "pat" });
    } catch (e: any) {
      return Response.json({ error: `PAT verification failed: ${e.message}` }, { status: 500 });
    }
  }

  if (body.method === "oauth") {
    // Return OAuth URL for the user to initiate
    const state = connection.id;
    const clientId = (env as any).GITHUB_CLIENT_ID;
    if (!clientId) {
      return Response.json(
        { error: "GitHub OAuth not configured" },
        { status: 500 }
      );
    }

    const redirectUri = `${(env as any).BASE_URL}/api/github/verify/callback`;
    const oauthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo&state=${state}`;

    return Response.json({ method: "oauth", oauthUrl });
  }

  return Response.json({ error: "Invalid method" }, { status: 400 });
}

// POST /api/libraries/:id/repo/ingest — Ingest docs from connected repo
export async function handleRepoIngest(
  request: Request,
  libraryId: string
): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createDb(env.DB);

  // Get verified connection
  const [connection] = await db
    .select()
    .from(schema.repoConnections)
    .where(
      and(
        eq(schema.repoConnections.libraryId, libraryId),
        eq(schema.repoConnections.userId, userId)
      )
    )
    .limit(1);

  if (!connection) {
    return Response.json({ error: "No repo connection found" }, { status: 404 });
  }

  if (!connection.verifiedAt) {
    return Response.json(
      { error: "Repo must be verified before ingesting" },
      { status: 403 }
    );
  }

  const { repoOwner, repoName } = connection;

  // Get library info
  const [library] = await db
    .select()
    .from(schema.libraries)
    .where(eq(schema.libraries.id, libraryId))
    .limit(1);

  if (!library) {
    return Response.json({ error: "Library not found" }, { status: 404 });
  }

  // Strategy: try llms.txt first, fall back to scanning markdown files
  let chunks: { id: string; title: string; content: string; url: string; tokenCount: number }[] = [];
  let sourceMethod = "markdown";

  // 1. Try llms.txt from repo (check if it exists at root)
  try {
    const llmsTxtRes = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/contents/llms.txt`,
      { headers: { "User-Agent": "Jeremy-App", Accept: "application/vnd.github.v3+json" } }
    );

    if (llmsTxtRes.ok) {
      const fileData = (await llmsTxtRes.json()) as { download_url?: string };
      if (fileData.download_url) {
        const docs = await fetchLlmsTxt(fileData.download_url);
        chunks = chunkDocs(libraryId, docs);
        sourceMethod = "llms_txt";
      }
    }
  } catch {
    // llms.txt not found or failed, fall back to markdown scanning
  }

  // 2. Fall back to scanning markdown files
  if (chunks.length === 0) {
    try {
      // Get repository tree
      const treeRes = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/HEAD?recursive=1`,
        { headers: { "User-Agent": "Jeremy-App", Accept: "application/vnd.github.v3+json" } }
      );

      if (!treeRes.ok) {
        return Response.json(
          { error: "Failed to read repository tree" },
          { status: 500 }
        );
      }

      const tree = (await treeRes.json()) as {
        tree: Array<{ path: string; type: string; url?: string }>;
      };

      // Filter to markdown files, skip common non-doc directories
      const skipDirs = ["node_modules", ".github", ".git", "vendor", "dist", "build", "__pycache__"];
      const mdFiles = tree.tree.filter((item) => {
        if (item.type !== "blob") return false;
        if (!/\.(md|mdx)$/i.test(item.path)) return false;
        return !skipDirs.some((dir) => item.path.startsWith(dir + "/"));
      });

      if (mdFiles.length === 0) {
        return Response.json(
          { error: "No markdown files found in repository" },
          { status: 400 }
        );
      }

      // Fetch each file's content (limit to 100 files)
      const filesToFetch = mdFiles.slice(0, 100);
      let chunkIdx = 0;

      for (const file of filesToFetch) {
        try {
          const contentRes = await fetch(
            `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${file.path}`,
            {
              headers: {
                "User-Agent": "Jeremy-App",
                Accept: "application/vnd.github.v3+json",
              },
            }
          );

          if (!contentRes.ok) continue;

          const fileData = (await contentRes.json()) as {
            content?: string;
            encoding?: string;
          };

          if (!fileData.content || fileData.encoding !== "base64") continue;

          const content = atob(fileData.content);
          if (content.trim().length < 50) continue;

          // Extract title from first heading or filename
          const titleMatch = content.match(/^#\s+(.+)/m);
          const title = titleMatch
            ? titleMatch[1].trim()
            : file.path.replace(/\.(md|mdx)$/i, "").split("/").pop() ?? file.path;

          const url = `https://github.com/${repoOwner}/${repoName}/blob/HEAD/${file.path}`;

          // Simple chunking: split by headings or paragraphs
          const CHARS_PER_TOKEN = 4;
          const TARGET_CHARS = 500 * CHARS_PER_TOKEN;
          const OVERLAP_CHARS = 50 * CHARS_PER_TOKEN;

          const paragraphs = content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
          let current: string[] = [];
          let currentLen = 0;

          const flush = () => {
            if (current.length === 0) return;
            const chunkContent = current.join("\n\n");
            chunks.push({
              id: `${libraryId}:gh:${chunkIdx++}`,
              title,
              content: chunkContent,
              url,
              tokenCount: Math.ceil(chunkContent.length / CHARS_PER_TOKEN),
            });
          };

          for (const para of paragraphs) {
            if (currentLen + para.length > TARGET_CHARS && current.length > 0) {
              flush();
              const overlap: string[] = [];
              let total = 0;
              for (let i = current.length - 1; i >= 0; i--) {
                if (total + current[i].length > OVERLAP_CHARS && overlap.length > 0) break;
                overlap.unshift(current[i]);
                total += current[i].length;
              }
              current = overlap;
              currentLen = total;
            }
            current.push(para);
            currentLen += para.length;
          }
          flush();
        } catch {
          // Skip failed files
        }
      }

      sourceMethod = "markdown";
    } catch (e: any) {
      return Response.json(
        { error: `Failed to scan repository: ${e.message}` },
        { status: 500 }
      );
    }
  }

  if (chunks.length === 0) {
    return Response.json(
      { error: "No content found in repository" },
      { status: 400 }
    );
  }

  // Delete old chunks
  await db.delete(schema.chunks).where(eq(schema.chunks.libraryId, libraryId));
  try {
    await deleteVectorsByLibrary(libraryId);
  } catch {}

  // Update library
  await db
    .update(schema.libraries)
    .set({
      sourceType: "github",
      chunkCount: chunks.length,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.libraries.id, libraryId));

  // Insert chunks in batches
  for (let i = 0; i < chunks.length; i += 10) {
    const batch = chunks.slice(i, i + 10);
    await db.insert(schema.chunks).values(
      batch.map((c) => ({
        id: c.id,
        libraryId,
        title: c.title ?? null,
        content: c.content,
        url: c.url ?? null,
        tokenCount: c.tokenCount ?? null,
      }))
    );
  }

  // Generate embeddings
  let vectorized = false;
  if (chunks.length <= 500) {
    try {
      const texts = chunks.map(
        (c) => `${c.title ? c.title + ": " : ""}${c.content}`.slice(0, 2000)
      );
      const embeddings = await generateEmbeddings(texts);
      const vectors = chunks.map((c, j) => ({
        id: c.id,
        values: embeddings[j],
        metadata: { chunkId: c.id, libraryId, title: c.title },
      }));
      await upsertVectors(vectors);
      vectorized = true;
    } catch (e: any) {
      console.warn("Embedding failed:", e.message);
    }
  }

  // Invalidate cache
  await invalidateLibrary(libraryId);

  // R2 backup
  try {
    await env.DOCS_BUCKET.put(`${libraryId}/chunks.json`, JSON.stringify(chunks));
  } catch {}

  // Update connection
  await db
    .update(schema.repoConnections)
    .set({ lastIngestedAt: new Date().toISOString() })
    .where(eq(schema.repoConnections.id, connection.id));

  return Response.json({
    success: true,
    libraryId,
    sourceMethod,
    chunksIngested: chunks.length,
    vectorized,
  });
}

// GET /api/libraries/:id/repo — Get connection status
export async function handleGetRepoConnection(
  request: Request,
  libraryId: string
): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createDb(env.DB);
  const [connection] = await db
    .select()
    .from(schema.repoConnections)
    .where(
      and(
        eq(schema.repoConnections.libraryId, libraryId),
        eq(schema.repoConnections.userId, userId)
      )
    )
    .limit(1);

  if (!connection) {
    return Response.json({ connected: false });
  }

  return Response.json({
    connected: true,
    id: connection.id,
    repoUrl: connection.repoUrl,
    repoOwner: connection.repoOwner,
    repoName: connection.repoName,
    verified: !!connection.verifiedAt,
    verifiedAt: connection.verifiedAt,
    verificationMethod: connection.verificationMethod,
    lastIngestedAt: connection.lastIngestedAt,
  });
}

// DELETE /api/libraries/:id/repo — Disconnect repo
export async function handleDisconnectRepo(
  request: Request,
  libraryId: string
): Promise<Response> {
  const userId = await resolveUserId(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createDb(env.DB);
  const [connection] = await db
    .select()
    .from(schema.repoConnections)
    .where(
      and(
        eq(schema.repoConnections.libraryId, libraryId),
        eq(schema.repoConnections.userId, userId)
      )
    )
    .limit(1);

  if (!connection) {
    return Response.json({ error: "No repo connection found" }, { status: 404 });
  }

  await db
    .delete(schema.repoConnections)
    .where(eq(schema.repoConnections.id, connection.id));

  return Response.json({ success: true });
}
