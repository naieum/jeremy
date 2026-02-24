import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import { createDb, schema } from "~/server/db";
import { eq } from "drizzle-orm";
import { useState, useEffect } from "react";

const getLibraryDetail = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const headers = getRequestHeaders();
    const host = headers.get("x-forwarded-host") || headers.get("host") || "";
    const proto = headers.get("x-forwarded-proto") || "http";
    const origin = host ? `${proto}://${host}` : undefined;
    const auth = createAuth(env as any, origin);
    const session = await auth.api.getSession({ headers });

    const db = createDb(env.DB);

    const [library] = await db
      .select()
      .from(schema.libraries)
      .where(eq(schema.libraries.id, id))
      .limit(1);

    if (!library) throw new Error("Library not found");

    const isOwner = session?.user?.id === library.ownerId;

    const chunks = await db
      .select({
        id: schema.chunks.id,
        title: schema.chunks.title,
        url: schema.chunks.url,
        tokenCount: schema.chunks.tokenCount,
      })
      .from(schema.chunks)
      .where(eq(schema.chunks.libraryId, id));

    return { library, chunks, isOwner };
  });

export const Route = createFileRoute("/dashboard/libraries/$id")({
  loader: ({ params }) => getLibraryDetail({ data: params.id }),
  component: LibraryDetailPage,
});

interface RepoConnection {
  connected: boolean;
  id?: string;
  repoUrl?: string;
  repoOwner?: string;
  repoName?: string;
  verified?: boolean;
  verifiedAt?: string;
  verificationMethod?: string;
  lastIngestedAt?: string;
}

interface DocSiteStatus {
  exists: boolean;
  id?: string;
  subdomain?: string;
  url?: string;
  status?: string;
  buildError?: string;
  lastBuiltAt?: string;
}

function LibraryDetailPage() {
  const { library, chunks, isOwner } = Route.useLoaderData();
  const navigate = useNavigate();

  async function handleDelete() {
    if (!confirm("Delete this library and all its chunks?")) return;
    const res = await fetch(`/api/libraries/${encodeURIComponent(library.id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      navigate({ to: "/dashboard/libraries" });
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/dashboard/libraries" className="text-sm text-muted hover:text-text transition-colors">
            &larr; Libraries
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-text">{library.name}</h1>
          <p className="mt-1 text-sm text-muted">
            <code className="font-mono text-xs">{library.id}</code>
            {library.version && <> · v{library.version}</>}
            {" · "}{library.chunkCount} chunks
          </p>
          {library.description && (
            <p className="mt-2 text-sm text-muted">{library.description}</p>
          )}
        </div>
        {isOwner && (
          <button
            onClick={handleDelete}
            className="rounded-lg border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 transition-colors"
          >
            Delete
          </button>
        )}
      </div>

      {library.sourceUrl && (
        <p className="text-sm text-muted">
          Source: <a href={library.sourceUrl} className="text-muted underline hover:text-text" target="_blank" rel="noopener">{library.sourceUrl}</a>
        </p>
      )}

      {isOwner && <RepoConnectionSection libraryId={library.id} />}
      {isOwner && <DocSiteSection libraryId={library.id} />}

      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text">Chunks ({chunks.length})</h2>
        </div>
        <div className="divide-y divide-border">
          {chunks.map((chunk) => (
            <div key={chunk.id} className="px-4 py-3">
              <p className="text-sm font-medium text-text">
                {chunk.title || chunk.id}
              </p>
              <p className="text-xs text-muted">
                {chunk.tokenCount && <>{chunk.tokenCount} tokens</>}
                {chunk.url && (
                  <> · <a href={chunk.url} className="underline" target="_blank" rel="noopener">{chunk.url}</a></>
                )}
              </p>
            </div>
          ))}
          {chunks.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No chunks. Use the CLI to ingest documentation.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RepoConnectionSection({ libraryId }: { libraryId: string }) {
  const [repo, setRepo] = useState<RepoConnection | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [verifyMethod, setVerifyMethod] = useState<"file" | "pat" | "oauth">("file");
  const [patToken, setPatToken] = useState("");
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/libraries/${encodeURIComponent(libraryId)}/repo`)
      .then((r) => r.json())
      .then((data) => setRepo(data as RepoConnection))
      .catch(() => {});
  }, [libraryId]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/libraries/${encodeURIComponent(libraryId)}/repo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as any).error || "Failed to connect");
        return;
      }
      setRepo({ connected: true, ...(data as any) });
      setRepoUrl("");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setError(null);
    setLoading(true);
    try {
      const body: any = { method: verifyMethod };
      if (verifyMethod === "pat") body.token = patToken;
      const res = await fetch(`/api/libraries/${encodeURIComponent(libraryId)}/repo/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setVerifyResult(data);
      if ((data as any).verified) {
        setRepo((prev) => prev ? { ...prev, verified: true, verifiedAt: new Date().toISOString() } : prev);
      }
      if ((data as any).method === "oauth" && (data as any).oauthUrl) {
        window.location.href = (data as any).oauthUrl;
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleIngest() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/libraries/${encodeURIComponent(libraryId)}/repo/ingest`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as any).error || "Ingest failed");
      } else {
        setRepo((prev) => prev ? { ...prev, lastIngestedAt: new Date().toISOString() } : prev);
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect this repository?")) return;
    await fetch(`/api/libraries/${encodeURIComponent(libraryId)}/repo`, { method: "DELETE" });
    setRepo({ connected: false });
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-text">GitHub repository</h2>
      </div>
      <div className="p-4 space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}

        {!repo?.connected ? (
          <form onSubmit={handleConnect} className="flex gap-3">
            <input
              type="url"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder-muted focus:border-muted focus:outline-none"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Connect
            </button>
          </form>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text">
                  {repo.repoOwner}/{repo.repoName}
                </p>
                <p className="text-xs text-muted">
                  {repo.verified ? (
                    <>Verified via {repo.verificationMethod} · {repo.verifiedAt && new Date(repo.verifiedAt).toLocaleDateString()}</>
                  ) : (
                    "Not verified"
                  )}
                  {repo.lastIngestedAt && (
                    <> · Last ingested {new Date(repo.lastIngestedAt).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <button
                onClick={handleDisconnect}
                className="text-sm text-danger hover:text-danger/80 transition-colors"
              >
                Disconnect
              </button>
            </div>

            {!repo.verified && (
              <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
                <p className="text-sm text-muted">Verify write access to this repository:</p>
                <div className="flex gap-2">
                  {(["file", "pat", "oauth"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setVerifyMethod(m)}
                      className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                        verifyMethod === m
                          ? "bg-text text-bg"
                          : "border border-border text-muted hover:text-text"
                      }`}
                    >
                      {m === "file" ? "File" : m === "pat" ? "Personal Access Token" : "GitHub OAuth"}
                    </button>
                  ))}
                </div>

                {verifyMethod === "pat" && (
                  <input
                    type="password"
                    placeholder="ghp_..."
                    value={patToken}
                    onChange={(e) => setPatToken(e.target.value)}
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder-muted focus:border-muted focus:outline-none"
                  />
                )}

                {verifyResult && !verifyResult.verified && verifyResult.instructions && (
                  <p className="text-xs text-muted">{verifyResult.instructions}</p>
                )}
                {verifyResult && !verifyResult.verified && verifyResult.token && (
                  <p className="text-xs text-muted">Token: <code className="text-text font-mono">{verifyResult.token}</code></p>
                )}

                <button
                  onClick={handleVerify}
                  disabled={loading}
                  className="rounded-lg bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? "Verifying..." : "Verify"}
                </button>
              </div>
            )}

            {repo.verified && (
              <button
                onClick={handleIngest}
                disabled={loading}
                className="rounded-lg bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? "Ingesting..." : "Ingest from repo"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DocSiteSection({ libraryId }: { libraryId: string }) {
  const [site, setSite] = useState<DocSiteStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/libraries/${encodeURIComponent(libraryId)}/docs`)
      .then((r) => r.json())
      .then((data) => setSite(data as DocSiteStatus))
      .catch(() => {});
  }, [libraryId]);

  async function handlePublish() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/libraries/${encodeURIComponent(libraryId)}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as any).error || "Failed to create doc site");
        return;
      }
      setSite({ exists: true, ...(data as any) });
    } finally {
      setLoading(false);
    }
  }

  async function handleBuild() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/libraries/${encodeURIComponent(libraryId)}/docs/build`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as any).error || "Build failed");
      } else {
        setSite((prev) => prev ? { ...prev, status: (data as any).status } : prev);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleUnpublish() {
    if (!confirm("Remove this doc site?")) return;
    setLoading(true);
    try {
      await fetch(`/api/libraries/${encodeURIComponent(libraryId)}/docs`, { method: "DELETE" });
      setSite({ exists: false });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-text">Hosted docs</h2>
      </div>
      <div className="p-4 space-y-3">
        {error && <p className="text-sm text-danger">{error}</p>}

        {!site?.exists ? (
          <div>
            <p className="text-sm text-muted mb-3">
              Publish documentation at a subdomain of docs.jeremy.dev. Requires a verified repo connection.
            </p>
            <button
              onClick={handlePublish}
              disabled={loading}
              className="rounded-lg bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Publish docs
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <a
                  href={site.url}
                  className="text-sm text-text underline hover:no-underline"
                  target="_blank"
                  rel="noopener"
                >
                  {site.url}
                </a>
                <p className="text-xs text-muted">
                  Status: {site.status}
                  {site.lastBuiltAt && <> · Built {new Date(site.lastBuiltAt).toLocaleDateString()}</>}
                </p>
                {site.buildError && (
                  <p className="text-xs text-danger mt-1">{site.buildError}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleBuild}
                  disabled={loading}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-text hover:bg-hover transition-colors disabled:opacity-50"
                >
                  Rebuild
                </button>
                <button
                  onClick={handleUnpublish}
                  disabled={loading}
                  className="text-sm text-danger hover:text-danger/80 transition-colors"
                >
                  Unpublish
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
