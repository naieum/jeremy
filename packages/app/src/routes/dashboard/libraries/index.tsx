import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import { createDb, schema } from "~/server/db";
import { and, eq, ne } from "drizzle-orm";
import { LibraryTable } from "~/components/library-table";

const getLibraries = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  const host = headers.get("x-forwarded-host") || headers.get("host") || "";
  const proto = headers.get("x-forwarded-proto") || "http";
  const origin = host ? `${proto}://${host}` : undefined;
  const auth = createAuth(env as any, origin);
  const session = await auth.api.getSession({ headers });
  if (!session) return { own: [], shared: [] };

  const userId = session.user.id;
  const db = createDb(env.DB);

  const own = await db.select().from(schema.libraries).where(eq(schema.libraries.ownerId, userId));
  const shared = await db.select().from(schema.libraries).where(
    and(eq(schema.libraries.isPublic, 1), ne(schema.libraries.ownerId, userId))
  );

  return { own, shared };
});

export const Route = createFileRoute("/dashboard/libraries/")({
  loader: () => getLibraries(),
  component: LibrariesPage,
});

function LibrariesPage() {
  const { own, shared } = Route.useLoaderData();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Libraries</h1>
          <p className="mt-1 text-sm text-muted">Indexed documentation libraries.</p>
        </div>
        <Link
          to="/dashboard/libraries/add"
          className="rounded-lg bg-text px-4 py-2 text-sm font-medium text-bg hover:opacity-90 transition-opacity"
        >
          Add library
        </Link>
      </div>

      <LibraryTable data={own} />

      {shared.length > 0 && (
        <div className="mt-10">
          <h2 className="text-base font-semibold text-text">Included with your account</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            {shared.length} libraries available to query via API and MCP.
          </p>
          <LibraryTable data={shared} />
        </div>
      )}
    </div>
  );
}
