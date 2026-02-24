import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import { handleAdminRebuild } from "~/server/api/admin";

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

export const Route = createFileRoute("/api/admin/libraries/$id/rebuild")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const userId = await getSessionUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return handleAdminRebuild(userId, params.id);
      },
    },
  },
});
