import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import { ingestFromUrl } from "~/server/api/ingest-url";

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

export const Route = createFileRoute("/api/ingest-url")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getSessionUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json() as {
          libraryId: string;
          name: string;
          description?: string;
          version?: string;
          sourceUrl: string;
          sourceType: string;
        };

        if (!body.libraryId || !body.name || !body.sourceUrl) {
          return Response.json({ error: "libraryId, name, and sourceUrl are required" }, { status: 400 });
        }

        try {
          const result = await ingestFromUrl({
            libraryId: body.libraryId,
            name: body.name,
            description: body.description,
            version: body.version,
            sourceUrl: body.sourceUrl,
            sourceType: body.sourceType,
            ownerId: userId,
          });
          return Response.json(result);
        } catch (e: any) {
          return Response.json({ error: e.message || "Ingest failed" }, { status: 400 });
        }
      },
    },
  },
});
