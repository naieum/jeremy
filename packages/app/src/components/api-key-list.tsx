import { useState } from "react";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string | null;
  lastUsedAt: string | null;
  createdAt: string | null;
}

interface ApiKeyListProps {
  keys: ApiKey[];
  onCreate: (name: string, permissions: string) => Promise<{ key: string } | null>;
  onDelete: (id: string) => Promise<void>;
}

export function ApiKeyList({ keys, onCreate, onDelete }: ApiKeyListProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyPermissions, setNewKeyPermissions] = useState("read");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const result = await onCreate(newKeyName, newKeyPermissions);
    if (result) {
      setCreatedKey(result.key);
      setNewKeyName("");
      setShowCreate(false);
    }
  }

  async function copyKey() {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div>
      {createdKey && (
        <div className="mb-6 rounded-lg border border-success/50 bg-success/10 p-4">
          <p className="text-sm font-medium text-success">
            API key created. Copy it now — it won't be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded bg-surface px-3 py-2 text-sm text-text font-mono">
              {createdKey}
            </code>
            <button
              onClick={copyKey}
              className="rounded bg-hover px-3 py-2 text-sm text-text hover:text-text transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="mt-2 text-xs text-success hover:text-success/80"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {keys.length} key{keys.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent-hover transition-colors"
        >
          Create Key
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border border-border bg-surface p-4">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Key name (e.g., Claude Code MCP)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder-muted focus:border-muted focus:outline-none"
              required
            />
            <select
              value={newKeyPermissions}
              onChange={(e) => setNewKeyPermissions(e.target.value)}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-muted focus:outline-none"
            >
              <option value="read">Read</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent-hover transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-border rounded-lg border border-border">
        {keys.map((key) => (
          <div key={key.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium text-text">{key.name}</p>
              <p className="text-xs text-muted">
                <code>{key.keyPrefix}...</code>
                {" · "}
                {key.permissions}
                {key.lastUsedAt && (
                  <> · Last used {new Date(key.lastUsedAt).toLocaleDateString()}</>
                )}
              </p>
            </div>
            <button
              onClick={() => onDelete(key.id)}
              className="text-sm text-danger hover:text-danger/80 transition-colors"
            >
              Revoke
            </button>
          </div>
        ))}
        {keys.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            No API keys. Create one to use the MCP server or CLI.
          </p>
        )}
      </div>
    </div>
  );
}
