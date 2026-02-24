import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb, schema } from "~/server/db";

const CATEGORY_META: Record<string, { label: string; order: number }> = {
  framework: { label: "Frameworks", order: 0 },
  library: { label: "Libraries", order: 1 },
  tool: { label: "Tools", order: 2 },
  language: { label: "Languages", order: 3 },
  platform: { label: "Platforms", order: 4 },
  database: { label: "Databases", order: 5 },
  other: { label: "Other", order: 6 },
};

const getPublicLibraries = createServerFn({ method: "GET" }).handler(async () => {
  const db = createDb(env.DB);

  const libraries = await db
    .select({
      id: schema.libraries.id,
      name: schema.libraries.name,
      description: schema.libraries.description,
      version: schema.libraries.version,
      sourceType: schema.libraries.sourceType,
      chunkCount: schema.libraries.chunkCount,
      category: schema.libraries.category,
      updatedAt: schema.libraries.updatedAt,
    })
    .from(schema.libraries)
    .where(eq(schema.libraries.isPublic, 1));

  return libraries;
});

export const Route = createFileRoute("/catalog")({
  loader: () => getPublicLibraries(),
  component: CatalogPage,
});

type Library = Awaited<ReturnType<typeof getPublicLibraries>>[number];

function CatalogPage() {
  const libraries = Route.useLoaderData();

  const grouped = libraries.reduce<Record<string, Library[]>>((acc, lib) => {
    const cat = lib.category ?? "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(lib);
    return acc;
  }, {});

  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99)
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link to="/" className="text-sm text-muted hover:text-text transition-colors">
        &larr; Home
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-text">Library catalog</h1>
      <p className="mt-2 text-sm text-muted">
        {libraries.length} public {libraries.length === 1 ? "library" : "libraries"} available
      </p>

      {sortedCategories.map((cat) => (
        <section key={cat} className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-text">
            {CATEGORY_META[cat]?.label ?? cat}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted">Name</th>
                  <th className="px-4 py-3 font-medium text-muted">Version</th>
                  <th className="px-4 py-3 font-medium text-muted">Source</th>
                  <th className="px-4 py-3 font-medium text-muted">Chunks</th>
                  <th className="px-4 py-3 font-medium text-muted">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {grouped[cat].map((lib) => (
                  <tr key={lib.id} className="hover:bg-surface/50">
                    <td className="px-4 py-3 text-text">
                      <div className="font-medium">{lib.name}</div>
                      {lib.description && (
                        <div className="text-xs text-muted">{lib.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lib.version ? (
                        <span className="rounded bg-hover px-2 py-0.5 text-xs text-muted font-mono">
                          {lib.version}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-hover px-2 py-0.5 text-xs text-muted">
                        {lib.sourceType ?? "unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text font-mono text-xs">{lib.chunkCount ?? 0}</td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {lib.updatedAt ? new Date(lib.updatedAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {libraries.length === 0 && (
        <div className="mt-10 rounded-lg border border-border px-4 py-8 text-center text-muted">
          No public libraries available yet.
        </div>
      )}
    </div>
  );
}
