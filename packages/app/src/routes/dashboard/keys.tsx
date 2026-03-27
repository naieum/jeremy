import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import { createDb, schema } from "~/server/db";
import { eq } from "drizzle-orm";
import { ApiKeyList } from "~/components/api-key-list";
import { useState } from "react";

const getKeys = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  const host = headers.get("x-forwarded-host") || headers.get("host") || "";
  const proto = headers.get("x-forwarded-proto") || "http";
  const origin = host ? `${proto}://${host}` : undefined;
  const auth = createAuth(env as any, origin);
  const session = await auth.api.getSession({ headers });
  if (!session) return [];

  const db = createDb(env.DB);
  return db
    .select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      permissions: schema.apiKeys.permissions,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, session.user.id));
});

export const Route = createFileRoute("/dashboard/keys")({
  loader: () => getKeys(),
  component: KeysPage,
});

function KeysPage() {
  const initialKeys = Route.useLoaderData();
  const [keys, setKeys] = useState(initialKeys);

  async function handleCreate(name: string, permissions: string) {
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, permissions }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    setKeys((prev) => [
      ...prev,
      {
        id: data.id,
        name: data.name,
        keyPrefix: data.keyPrefix,
        permissions: data.permissions,
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    return { key: data.key };
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setKeys((prev) => prev.filter((k) => k.id !== id));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">API keys</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Manage API keys for the MCP server and API.
      </p>
      <ApiKeyList keys={keys} onCreate={handleCreate} onDelete={handleDelete} />
    </div>
  );
}
