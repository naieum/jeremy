import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import { createDb, schema } from "~/server/db";
import { count, eq, sql } from "drizzle-orm";

const getStats = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  const host = headers.get("x-forwarded-host") || headers.get("host") || "";
  const proto = headers.get("x-forwarded-proto") || "http";
  const origin = host ? `${proto}://${host}` : undefined;
  const auth = createAuth(env as any, origin);
  const session = await auth.api.getSession({ headers });
  if (!session) return { libraries: 0, chunks: 0, apiKeys: 0 };

  const userId = session.user.id;
  const db = createDb(env.DB);

  const [libCount] = await db.select({ count: count() }).from(schema.libraries).where(eq(schema.libraries.ownerId, userId));

  const [chunkCount] = await db
    .select({ count: count() })
    .from(schema.chunks)
    .where(
      sql`${schema.chunks.libraryId} IN (SELECT id FROM libraries WHERE owner_id = ${userId})`
    );

  const [keyCount] = await db.select({ count: count() }).from(schema.apiKeys).where(eq(schema.apiKeys.userId, userId));

  return {
    libraries: libCount.count,
    chunks: chunkCount.count,
    apiKeys: keyCount.count,
  };
});

export const Route = createFileRoute("/dashboard/")({
  loader: () => getStats(),
  component: DashboardOverview,
});

function DashboardOverview() {
  const stats = Route.useLoaderData();

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">Overview of your jeremy instance.</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Libraries" value={stats.libraries} href="/dashboard/libraries" />
        <StatCard label="Doc chunks" value={stats.chunks} />
        <StatCard label="API keys" value={stats.apiKeys} href="/dashboard/keys" />
      </div>

      <div className="mt-10 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-base font-semibold text-text">Quick start</h2>
        <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-muted">
          <li>
            <Link to="/dashboard/settings" className="text-text underline hover:no-underline">
              Connect the MCP server
            </Link>{" "}
            to Claude Code
          </li>
          <li>
            <Link to="/dashboard/libraries/add" className="text-text underline hover:no-underline">
              Add a library
            </Link>{" "}
            from an llms.txt URL or docs page
          </li>
          <li>Query your docs via the MCP server or API</li>
          <li>
            <Link to="/dashboard/libraries" className="text-text underline hover:no-underline">
              View your libraries
            </Link>
          </li>
        </ol>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <div className="rounded-lg border border-border bg-surface p-6">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-text">{value}</p>
    </div>
  );

  if (href) {
    return <Link to={href}>{content}</Link>;
  }
  return content;
}
