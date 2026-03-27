import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import {
  handleUpdateSource,
  handleDeleteSource,
} from "~/server/api/admin-discovery";

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

export const Route = createFileRoute("/api/admin/discovery/sources/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const userId = await getSessionUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return handleUpdateSource(userId, params.id, request);
      },
      DELETE: async ({ request, params }) => {
        const userId = await getSessionUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return handleDeleteSource(userId, params.id);
      },
    },
  },
});
