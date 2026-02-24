import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/dashboard/admin/users/$id")({
  beforeLoad: ({ context }) => {
    if (!(context as any).isAdmin) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminUserDetail,
});

function AdminUserDetail() {
  const { id: userId } = Route.useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [flagAction, setFlagAction] = useState<"add" | "remove">("add");
  const [selectedFlag, setSelectedFlag] = useState("warned");
  const [flagReason, setFlagReason] = useState("");

  useEffect(() => {
    fetch(`/api/admin/users/${userId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [userId]);

  async function handleFlag(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/admin/users/${userId}/flags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: flagAction,
        flag: selectedFlag,
        reason: flagReason || undefined,
      }),
    });
    if (res.ok) {
      const refreshed = await fetch(`/api/admin/users/${userId}`).then((r) => r.json());
      setData(refreshed);
      setFlagReason("");
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading...</p>;
  if (!data?.user) return <p className="text-sm text-danger">User not found</p>;

  const { user, libraries, flags, repoConnections, apiKeys } = data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dashboard/admin" className="text-sm text-muted hover:text-text transition-colors">
          &larr; Admin
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-text">{user.name}</h1>
        <p className="text-sm text-muted">{user.email} · <span className="font-mono text-xs">{user.id}</span></p>
      </div>

      {/* Flags */}
      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text">Flags ({flags.length})</h2>
        </div>
        <div className="p-4 space-y-3">
          {flags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {flags.map((f: any) => (
                <span
                  key={f.id}
                  className={`rounded px-2 py-1 text-xs ${
                    f.flag === "banned"
                      ? "bg-danger/20 text-danger"
                      : f.flag === "verified"
                        ? "bg-success/20 text-success"
                        : "bg-hover text-muted"
                  }`}
                >
                  {f.flag}
                  {f.reason && ` — ${f.reason}`}
                </span>
              ))}
            </div>
          )}

          <form onSubmit={handleFlag} className="flex items-end gap-2">
            <select
              value={flagAction}
              onChange={(e) => setFlagAction(e.target.value as "add" | "remove")}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-muted focus:outline-none"
            >
              <option value="add">Add</option>
              <option value="remove">Remove</option>
            </select>
            <select
              value={selectedFlag}
              onChange={(e) => setSelectedFlag(e.target.value)}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-muted focus:outline-none"
            >
              <option value="warned">warned</option>
              <option value="banned">banned</option>
              <option value="suspended">suspended</option>
              <option value="verified">verified</option>
            </select>
            <input
              type="text"
              placeholder="Reason (optional)"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder-muted focus:border-muted focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 transition-opacity"
            >
              Apply
            </button>
          </form>
        </div>
      </div>

      {/* Libraries */}
      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text">Libraries ({libraries.length})</h2>
        </div>
        <div className="divide-y divide-border">
          {libraries.map((lib: any) => (
            <div key={lib.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm text-text">{lib.name}</p>
                <p className="text-xs text-muted">
                  {lib.chunkCount} chunks · {lib.sourceType}
                </p>
              </div>
              <Link
                to="/dashboard/libraries/$id"
                params={{ id: lib.id }}
                className="text-xs text-muted hover:text-text transition-colors"
              >
                View
              </Link>
            </div>
          ))}
          {libraries.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">No libraries</p>
          )}
        </div>
      </div>

      {/* API Keys */}
      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-text">API keys ({apiKeys.length})</h2>
        </div>
        <div className="divide-y divide-border">
          {apiKeys.map((key: any) => (
            <div key={key.id} className="px-4 py-3">
              <p className="text-sm text-text">{key.name}</p>
              <p className="text-xs text-muted">
                <span className="font-mono">{key.keyPrefix}...</span> · {key.permissions}
                {key.lastUsedAt && <> · Last used {new Date(key.lastUsedAt).toLocaleDateString()}</>}
              </p>
            </div>
          ))}
          {apiKeys.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">No API keys</p>
          )}
        </div>
      </div>

      {/* Repo Connections */}
      {repoConnections.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-base font-semibold text-text">Repo connections ({repoConnections.length})</h2>
          </div>
          <div className="divide-y divide-border">
            {repoConnections.map((conn: any) => (
              <div key={conn.id} className="px-4 py-3">
                <p className="text-sm text-text">
                  {conn.repoOwner}/{conn.repoName}
                </p>
                <p className="text-xs text-muted">
                  {conn.verifiedAt ? `Verified via ${conn.verificationMethod}` : "Unverified"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
