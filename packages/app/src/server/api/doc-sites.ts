import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq, and } from "drizzle-orm";

async function getSessionUserId(request: Request): Promise<string | null> {
  try {
    const { createAuth } = await import("../auth");
    const origin = new URL(request.url).origin;
    const auth = createAuth(env as any, origin);
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

// POST /api/libraries/:id/docs — Create doc site
export async function handleCreateDocSite(
  request: Request,
  libraryId: string
): Promise<Response> {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createDb(env.DB);

  // Verify library ownership
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
    return Response.json({ error: "Library not found" }, { status: 404 });
  }

  // Check for verified repo connection
  const [connection] = await db
    .select()
    .from(schema.repoConnections)
    .where(eq(schema.repoConnections.libraryId, libraryId))
    .limit(1);

  if (!connection || !connection.verifiedAt) {
    return Response.json(
      { error: "A verified repo connection is required to create a doc site" },
      { status: 403 }
    );
  }

  // Check for existing doc site
  const [existing] = await db
    .select()
    .from(schema.docSites)
    .where(eq(schema.docSites.libraryId, libraryId))
    .limit(1);

  if (existing) {
    return Response.json(
      { error: "Doc site already exists for this library", site: existing },
      { status: 409 }
    );
  }

  // Generate subdomain from library name
  const body = (await request.json().catch(() => ({}))) as {
    subdomain?: string;
  };
  let subdomain = body.subdomain
    ? slugify(body.subdomain)
    : slugify(library.name);

  if (!subdomain) {
    subdomain = slugify(libraryId);
  }

  // Check subdomain uniqueness
  const [subdomainTaken] = await db
    .select()
    .from(schema.docSites)
    .where(eq(schema.docSites.subdomain, subdomain))
    .limit(1);

  if (subdomainTaken) {
    return Response.json(
      { error: `Subdomain "${subdomain}" is already taken` },
      { status: 409 }
    );
  }

  const siteId = crypto.randomUUID();
  await db.insert(schema.docSites).values({
    id: siteId,
    libraryId,
    userId,
    subdomain,
    status: "pending",
  });

  return Response.json({
    id: siteId,
    libraryId,
    subdomain,
    url: `https://${subdomain}.docs.jeremy.dev`,
    status: "pending",
  });
}

// POST /api/libraries/:id/docs/build — Trigger rebuild
export async function handleBuildDocSite(
  request: Request,
  libraryId: string
): Promise<Response> {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createDb(env.DB);

  const [site] = await db
    .select()
    .from(schema.docSites)
    .where(
      and(
        eq(schema.docSites.libraryId, libraryId),
        eq(schema.docSites.userId, userId)
      )
    )
    .limit(1);

  if (!site) {
    return Response.json({ error: "Doc site not found" }, { status: 404 });
  }

  // Update status to building
  await db
    .update(schema.docSites)
    .set({ status: "building", buildError: null })
    .where(eq(schema.docSites.id, site.id));

  // Trigger GitHub Actions workflow dispatch
  try {
    const ghToken = (env as any).GITHUB_ACTIONS_TOKEN;
    const ghRepo = (env as any).GITHUB_REPO ?? "jeremy"; // owner/repo or just repo name
    const ghOwner = (env as any).GITHUB_OWNER;

    if (ghToken && ghOwner) {
      await fetch(
        `https://api.github.com/repos/${ghOwner}/${ghRepo}/dispatches`,
        {
          method: "POST",
          headers: {
            "User-Agent": "Jeremy-App",
            Authorization: `token ${ghToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event_type: "build-docs",
            client_payload: {
              libraryId,
              subdomain: site.subdomain,
              siteId: site.id,
            },
          }),
        }
      );
    } else {
      // If no GitHub Actions token, generate and upload directly
      const { generateAndUploadDocs } = await import("../lib/docs-generator");
      await generateAndUploadDocs(libraryId, site.subdomain);

      await db
        .update(schema.docSites)
        .set({
          status: "live",
          lastBuiltAt: new Date().toISOString(),
        })
        .where(eq(schema.docSites.id, site.id));

      return Response.json({
        status: "live",
        url: `https://${site.subdomain}.docs.jeremy.dev`,
      });
    }
  } catch (e: any) {
    await db
      .update(schema.docSites)
      .set({ status: "error", buildError: e.message })
      .where(eq(schema.docSites.id, site.id));

    return Response.json(
      { error: `Build trigger failed: ${e.message}` },
      { status: 500 }
    );
  }

  return Response.json({
    status: "building",
    url: `https://${site.subdomain}.docs.jeremy.dev`,
  });
}

// GET /api/libraries/:id/docs — Get doc site status
export async function handleGetDocSite(
  request: Request,
  libraryId: string
): Promise<Response> {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createDb(env.DB);

  const [site] = await db
    .select()
    .from(schema.docSites)
    .where(eq(schema.docSites.libraryId, libraryId))
    .limit(1);

  if (!site) {
    return Response.json({ exists: false });
  }

  return Response.json({
    exists: true,
    id: site.id,
    subdomain: site.subdomain,
    url: `https://${site.subdomain}.docs.jeremy.dev`,
    status: site.status,
    buildError: site.buildError,
    lastBuiltAt: site.lastBuiltAt,
    customDomain: site.customDomain,
  });
}

// DELETE /api/libraries/:id/docs — Remove doc site
export async function handleDeleteDocSite(
  request: Request,
  libraryId: string
): Promise<Response> {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createDb(env.DB);

  const [site] = await db
    .select()
    .from(schema.docSites)
    .where(
      and(
        eq(schema.docSites.libraryId, libraryId),
        eq(schema.docSites.userId, userId)
      )
    )
    .limit(1);

  if (!site) {
    return Response.json({ error: "Doc site not found" }, { status: 404 });
  }

  // Clean up R2 files
  try {
    const prefix = `docs/${site.subdomain}/`;
    const listed = await env.DOCS_BUCKET.list({ prefix });
    for (const obj of listed.objects) {
      await env.DOCS_BUCKET.delete(obj.key);
    }
  } catch (e) {
    console.warn("R2 cleanup failed:", e);
  }

  // Delete the record
  await db.delete(schema.docSites).where(eq(schema.docSites.id, site.id));

  return Response.json({ success: true });
}
