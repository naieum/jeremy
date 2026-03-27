import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/dashboard/admin/")({
  beforeLoad: ({ context }) => {
    if (!(context as any).isAdmin) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminDashboard,
});

interface AdminUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  libraryCount: number;
  flags: string[];
}

interface AdminLibrary {
  id: string;
  name: string;
  category: string | null;
  chunkCount: number | null;
  sourceType: string | null;
  updatedAt: string | null;
}

const VALID_CATEGORIES = [
  "framework",
  "library",
  "tool",
  "language",
  "platform",
  "database",
  "other",
];

interface DiscoverySource {
  id: string;
  type: string;
  name: string;
  config: string;
  enabled: number;
  schedule: string;
  lastRunAt: string | null;
  lastRunResult: string | null;
}

interface DiscoveryQueueCounts {
  pending: number;
  done: number;
  skipped: number;
  error: number;
}

interface DiscoveryQueueItem {
  id: string;
  sourceId: string;
  identifier: string;
  name: string;
  status: string;
  libraryId: string | null;
  docsUrl: string | null;
  strategy: string | null;
  skipReason: string | null;
  errorMsg: string | null;
  discoveredAt: string | null;
}

function AdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Libraries state
  const [libraries, setLibraries] = useState<AdminLibrary[]>([]);
  const [libLoading, setLibLoading] = useState(true);

  // Feed document state
  const [feedUrl, setFeedUrl] = useState("");
  const [feedSourceType, setFeedSourceType] = useState<"llms_txt" | "crawl">("llms_txt");
  const [feedCategory, setFeedCategory] = useState("other");
  const [feedLibraryId, setFeedLibraryId] = useState("");
  const [feedNewName, setFeedNewName] = useState("");
  const [feedMode, setFeedMode] = useState<"existing" | "new">("new");
  const [feedStatus, setFeedStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });

  // Rebuild state
  const [rebuildLibraryId, setRebuildLibraryId] = useState("");
  const [rebuildStatus, setRebuildStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });
  const [embedProgress, setEmbedProgress] = useState<{ done: number; total: number } | null>(null);

  // Discovery state
  const [discoverySources, setDiscoverySources] = useState<DiscoverySource[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [discoveryRunStatus, setDiscoveryRunStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });
  const [queueCounts, setQueueCounts] = useState<DiscoveryQueueCounts>({ pending: 0, done: 0, skipped: 0, error: 0 });
  const [queueItems, setQueueItems] = useState<DiscoveryQueueItem[]>([]);
  const [rssUrl, setRssUrl] = useState("");
  const [rssName, setRssName] = useState("");
  const [showRssModal, setShowRssModal] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/users?limit=${limit}&offset=${offset}`)
      .then((r) => r.json())
      .then((data: any) => {
        setUsers(data.users ?? []);
        setTotal(data.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [offset]);

  const fetchLibraries = () => {
    setLibLoading(true);
    fetch("/api/admin/libraries")
      .then((r) => r.json())
      .then((data: any) => {
        setLibraries(data.libraries ?? []);
      })
      .finally(() => setLibLoading(false));
  };

  useEffect(() => {
    fetchLibraries();
  }, []);

  const fetchDiscovery = () => {
    setDiscoveryLoading(true);
    Promise.all([
      fetch("/api/admin/discovery/sources").then((r) => r.json()),
      fetch("/api/admin/discovery/queue?limit=10").then((r) => r.json()),
    ])
      .then(([sourcesData, queueData]: any[]) => {
        setDiscoverySources(sourcesData.sources ?? []);
        setQueueCounts(queueData.counts ?? { pending: 0, done: 0, skipped: 0, error: 0 });
        setQueueItems(queueData.items ?? []);
      })
      .finally(() => setDiscoveryLoading(false));
  };

  useEffect(() => {
    fetchDiscovery();
  }, []);

  const handleDiscoveryRun = async () => {
    setDiscoveryRunStatus({ type: "loading", message: "Running discovery..." });
    try {
      const res = await fetch("/api/admin/discovery/run", { method: "POST" });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setDiscoveryRunStatus({
        type: "success",
        message: `Sources: ${data.sourcesRun}, New: ${data.newItems}, Ingested: ${data.ingested}, Crawled: ${data.crawled}`,
      });
      fetchDiscovery();
      fetchLibraries();
    } catch (e: any) {
      setDiscoveryRunStatus({ type: "error", message: e.message });
    }
  };

  const handleToggleSource = async (sourceId: string, currentEnabled: number) => {
    await fetch(`/api/admin/discovery/sources/${encodeURIComponent(sourceId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: currentEnabled ? 0 : 1 }),
    });
    fetchDiscovery();
  };

  const handleAddRssFeed = async () => {
    if (!rssUrl || !rssName) return;
    try {
      const res = await fetch("/api/admin/discovery/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "rss",
          name: rssName,
          config: JSON.stringify({ feedUrl: rssUrl }),
          schedule: "daily",
        }),
      });
      if (!res.ok) {
        const data = await res.json() as any;
        throw new Error(data.error);
      }
      setRssUrl("");
      setRssName("");
      setShowRssModal(false);
      fetchDiscovery();
    } catch (e: any) {
      alert(`Failed to add RSS feed: ${e.message}`);
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!confirm("Delete this source?")) return;
    await fetch(`/api/admin/discovery/sources/${encodeURIComponent(sourceId)}`, {
      method: "DELETE",
    });
    fetchDiscovery();
  };

  const handleFeedSubmit = async () => {
    setFeedStatus({ type: "loading", message: "Ingesting..." });

    try {
      // Resolve libraryId and name
      let libraryId: string;
      let name: string;

      if (feedMode === "existing" && feedLibraryId) {
        libraryId = feedLibraryId;
        const lib = libraries.find((l) => l.id === feedLibraryId);
        name = lib?.name ?? feedLibraryId;
      } else if (feedMode === "new" && feedNewName) {
        name = feedNewName;
        libraryId = feedNewName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      } else {
        throw new Error("Select a library or enter a name");
      }

      let data: any;

      if (feedSourceType === "crawl") {
        const res = await fetch("/api/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            libraryId,
            name,
            urls: [feedUrl],
            replace: true,
          }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Crawl failed (${res.status})`);
      } else {
        const res = await fetch("/api/ingest-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            libraryId,
            name,
            sourceUrl: feedUrl,
            sourceType: feedSourceType,
          }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Ingest failed (${res.status})`);
      }

      const resolvedId = data.libraryId ?? libraryId;

      // Set category
      if (resolvedId && feedCategory) {
        await fetch(`/api/admin/libraries/${encodeURIComponent(resolvedId)}/category`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: feedCategory }),
        });
      }

      setFeedStatus({ type: "success", message: `Ingested ${data.chunksIngested ?? 0} chunks (${resolvedId})` });
      setFeedUrl("");
      setFeedNewName("");
      fetchLibraries();
    } catch (e: any) {
      setFeedStatus({ type: "error", message: e.message });
    }
  };

  const handleRebuild = async () => {
    if (!rebuildLibraryId) return;

    setRebuildStatus({ type: "loading", message: "Starting rebuild..." });
    setEmbedProgress(null);

    try {
      // Find the library to get chunk count
      const lib = libraries.find((l) => l.id === rebuildLibraryId);
      const totalChunks = lib?.chunkCount ?? 0;

      // Embed in batches of 200
      if (totalChunks > 0) {
        setRebuildStatus({ type: "loading", message: "Embedding chunks..." });
        const batchSize = 200;
        let embedded = 0;

        for (let batchOffset = 0; batchOffset < totalChunks; batchOffset += batchSize) {
          const embedRes = await fetch("/api/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              libraryId: rebuildLibraryId,
              offset: batchOffset,
              limit: batchSize,
            }),
          });

          if (!embedRes.ok) {
            const errData = await embedRes.json() as any;
            throw new Error(errData.error ?? `Embed failed at offset ${batchOffset}`);
          }

          const embedData = await embedRes.json() as any;
          embedded += embedData.processed ?? batchSize;
          setEmbedProgress({ done: Math.min(embedded, totalChunks), total: totalChunks });
        }
      }

      // Trigger rebuild
      setRebuildStatus({ type: "loading", message: "Building doc site..." });
      const rebuildRes = await fetch(`/api/admin/libraries/${rebuildLibraryId}/rebuild`, {
        method: "POST",
      });

      const rebuildData = await rebuildRes.json() as any;

      if (!rebuildRes.ok) {
        throw new Error(rebuildData.error ?? `Rebuild failed (${rebuildRes.status})`);
      }

      setRebuildStatus({
        type: "success",
        message: `Rebuild ${rebuildData.status}${rebuildData.url ? ` — ${rebuildData.url}` : ""}`,
      });
      setEmbedProgress(null);
      fetchLibraries();
    } catch (e: any) {
      setRebuildStatus({ type: "error", message: e.message });
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">Admin</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        {total} users total
      </p>

      {/* Users Table */}
      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted">Name</th>
                  <th className="px-4 py-3 font-medium text-muted">Email</th>
                  <th className="px-4 py-3 font-medium text-muted">Libraries</th>
                  <th className="px-4 py-3 font-medium text-muted">Flags</th>
                  <th className="px-4 py-3 font-medium text-muted">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-hover/50">
                    <td className="px-4 py-3">
                      <Link
                        to="/dashboard/admin/users/$id"
                        params={{ id: user.id }}
                        className="text-text hover:underline"
                      >
                        {user.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{user.email}</td>
                    <td className="px-4 py-3 text-muted">{user.libraryCount}</td>
                    <td className="px-4 py-3">
                      {user.flags.map((f) => (
                        <span
                          key={f}
                          className={`mr-1 rounded px-2 py-0.5 text-xs ${
                            f === "banned"
                              ? "bg-danger/20 text-danger"
                              : f === "verified"
                                ? "bg-success/20 text-success"
                                : "bg-hover text-muted"
                          }`}
                        >
                          {f}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > limit && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-text disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-text disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Feed Document Section */}
      <section className="mt-12">
        <h2 className="text-xl font-bold text-text">Feed document</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Ingest a URL into a new or existing library.
        </p>

        <div className="space-y-4 rounded-lg border border-border p-4">
          {/* Library target */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="radio"
                name="feedMode"
                checked={feedMode === "new"}
                onChange={() => setFeedMode("new")}
              />
              New library
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="radio"
                name="feedMode"
                checked={feedMode === "existing"}
                onChange={() => setFeedMode("existing")}
              />
              Existing library
            </label>
          </div>

          {feedMode === "new" ? (
            <input
              type="text"
              placeholder="Library name"
              value={feedNewName}
              onChange={(e) => setFeedNewName(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-muted focus:border-text focus:outline-none"
            />
          ) : (
            <select
              value={feedLibraryId}
              onChange={(e) => setFeedLibraryId(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text focus:border-text focus:outline-none"
            >
              <option value="">Select a library...</option>
              {libraries.map((lib) => (
                <option key={lib.id} value={lib.id}>
                  {lib.name}
                </option>
              ))}
            </select>
          )}

          {/* URL */}
          <input
            type="text"
            placeholder="URL to ingest"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-muted focus:border-text focus:outline-none"
          />

          {/* Source type + category */}
          <div className="flex gap-4">
            <select
              value={feedSourceType}
              onChange={(e) => setFeedSourceType(e.target.value as "llms_txt" | "crawl")}
              className="rounded border border-border bg-background px-3 py-2 text-sm text-text focus:border-text focus:outline-none"
            >
              <option value="llms_txt">llms.txt</option>
              <option value="crawl">Crawl</option>
            </select>

            <select
              value={feedCategory}
              onChange={(e) => setFeedCategory(e.target.value)}
              className="rounded border border-border bg-background px-3 py-2 text-sm text-text focus:border-text focus:outline-none"
            >
              {VALID_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleFeedSubmit}
              disabled={feedStatus.type === "loading" || !feedUrl || (feedMode === "new" && !feedNewName) || (feedMode === "existing" && !feedLibraryId)}
              className="rounded bg-text px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {feedStatus.type === "loading" ? "Ingesting..." : "Feed"}
            </button>

            {feedStatus.type !== "idle" && feedStatus.type !== "loading" && (
              <span
                className={`text-sm ${feedStatus.type === "success" ? "text-success" : "text-danger"}`}
              >
                {feedStatus.message}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Rebuild Section */}
      <section className="mt-12 mb-16">
        <h2 className="text-xl font-bold text-text">Rebuild</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Re-embed chunks and rebuild a library's doc site.
        </p>

        <div className="space-y-4 rounded-lg border border-border p-4">
          <select
            value={rebuildLibraryId}
            onChange={(e) => setRebuildLibraryId(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text focus:border-text focus:outline-none"
          >
            <option value="">Select a library...</option>
            {libraries.map((lib) => (
              <option key={lib.id} value={lib.id}>
                {lib.name} ({lib.chunkCount ?? 0} chunks)
              </option>
            ))}
          </select>

          <div className="flex items-center gap-4">
            <button
              onClick={handleRebuild}
              disabled={rebuildStatus.type === "loading" || !rebuildLibraryId}
              className="rounded bg-text px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {rebuildStatus.type === "loading" ? "Rebuilding..." : "Rebuild"}
            </button>

            {rebuildStatus.type !== "idle" && rebuildStatus.type !== "loading" && (
              <span
                className={`text-sm ${rebuildStatus.type === "success" ? "text-success" : "text-danger"}`}
              >
                {rebuildStatus.message}
              </span>
            )}
          </div>

          {embedProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted">
                <span>Embedding progress</span>
                <span>{embedProgress.done} / {embedProgress.total}</span>
              </div>
              <div className="h-2 rounded-full bg-hover">
                <div
                  className="h-2 rounded-full bg-text transition-all"
                  style={{
                    width: `${embedProgress.total > 0 ? (embedProgress.done / embedProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {rebuildStatus.type === "loading" && rebuildStatus.message && (
            <p className="text-sm text-muted">{rebuildStatus.message}</p>
          )}
        </div>
      </section>

      {/* Discovery Section */}
      <section className="mt-12 mb-16">
        <h2 className="text-xl font-bold text-text">Discovery</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Automated documentation discovery from package registries and feeds.
        </p>

        {/* Sources Panel */}
        <div className="space-y-4 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-text">Sources</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRssModal(true)}
                className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-text"
              >
                Add RSS Feed
              </button>
              <button
                onClick={handleDiscoveryRun}
                disabled={discoveryRunStatus.type === "loading"}
                className="rounded bg-text px-4 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
              >
                {discoveryRunStatus.type === "loading" ? "Running..." : "Run Now"}
              </button>
            </div>
          </div>

          {discoveryRunStatus.type !== "idle" && discoveryRunStatus.type !== "loading" && (
            <p className={`text-sm ${discoveryRunStatus.type === "success" ? "text-success" : "text-danger"}`}>
              {discoveryRunStatus.message}
            </p>
          )}

          {discoveryLoading ? (
            <p className="text-muted text-sm">Loading...</p>
          ) : (
            <div className="rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface">
                  <tr>
                    <th className="px-4 py-2 font-medium text-muted">Name</th>
                    <th className="px-4 py-2 font-medium text-muted">Type</th>
                    <th className="px-4 py-2 font-medium text-muted">Schedule</th>
                    <th className="px-4 py-2 font-medium text-muted">Enabled</th>
                    <th className="px-4 py-2 font-medium text-muted">Last Run</th>
                    <th className="px-4 py-2 font-medium text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {discoverySources.map((source) => (
                    <tr key={source.id} className="hover:bg-hover/50">
                      <td className="px-4 py-2 text-text">{source.name}</td>
                      <td className="px-4 py-2 text-muted">{source.type}</td>
                      <td className="px-4 py-2 text-muted">{source.schedule}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleToggleSource(source.id, source.enabled)}
                          className={`rounded px-2 py-0.5 text-xs ${
                            source.enabled
                              ? "bg-success/20 text-success"
                              : "bg-hover text-muted"
                          }`}
                        >
                          {source.enabled ? "On" : "Off"}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-muted text-xs">
                        {source.lastRunResult
                          ? source.lastRunResult.slice(0, 30)
                          : "Never"}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleDeleteSource(source.id)}
                          className="text-xs text-danger hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Queue Panel */}
        <div className="mt-4 space-y-4 rounded-lg border border-border p-4">
          <h3 className="font-medium text-text">Queue</h3>
          <div className="flex gap-4 text-sm">
            <span className="text-muted">
              Pending: <span className="text-text">{queueCounts.pending}</span>
            </span>
            <span className="text-muted">
              Done: <span className="text-success">{queueCounts.done}</span>
            </span>
            <span className="text-muted">
              Skipped: <span className="text-text">{queueCounts.skipped}</span>
            </span>
            <span className="text-muted">
              Errors: <span className="text-danger">{queueCounts.error}</span>
            </span>
          </div>

          {queueItems.length > 0 && (
            <div className="rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface">
                  <tr>
                    <th className="px-4 py-2 font-medium text-muted">Name</th>
                    <th className="px-4 py-2 font-medium text-muted">Source</th>
                    <th className="px-4 py-2 font-medium text-muted">Status</th>
                    <th className="px-4 py-2 font-medium text-muted">Library</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {queueItems.map((item) => (
                    <tr key={item.id} className="hover:bg-hover/50">
                      <td className="px-4 py-2 text-text">{item.name}</td>
                      <td className="px-4 py-2 text-muted">{item.sourceId}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            item.status === "done"
                              ? "bg-success/20 text-success"
                              : item.status === "error"
                                ? "bg-danger/20 text-danger"
                                : item.status === "skipped"
                                  ? "bg-hover text-muted"
                                  : "bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted text-xs">
                        {item.libraryId ? (
                          <Link
                            to="/dashboard/libraries/$id"
                            params={{ id: item.libraryId }}
                            className="hover:underline"
                          >
                            {item.libraryId}
                          </Link>
                        ) : (
                          item.skipReason || item.errorMsg || "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RSS Modal */}
        {showRssModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg border border-border bg-background p-6">
              <h3 className="text-lg font-bold text-text">Add RSS Feed</h3>
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  placeholder="Feed name"
                  value={rssName}
                  onChange={(e) => setRssName(e.target.value)}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-muted focus:border-text focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Feed URL"
                  value={rssUrl}
                  onChange={(e) => setRssUrl(e.target.value)}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-muted focus:border-text focus:outline-none"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowRssModal(false)}
                    className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-text"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddRssFeed}
                    disabled={!rssUrl || !rssName}
                    className="rounded bg-text px-4 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
