import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import { validateApiKey } from "~/server/middleware/api-auth";
import { handleGetLibrary, handleDeleteLibrary } from "~/server/api/libraries";

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

export const Route = createFileRoute("/api/libraries/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const userId = await getSessionUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const url = new URL(request.url);
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 500);
        const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
        return handleGetLibrary(params.id, userId, limit, offset);
      },
      DELETE: async ({ request, params }) => {
        const apiAuth = await validateApiKey(request, "admin");
        const sessionUserId = apiAuth ? null : await getSessionUserId(request);
        const userId = apiAuth?.userId ?? sessionUserId;
        if (!userId) {
          return Response.json({ error: "Unauthorized (admin API key or session required)" }, { status: 401 });
        }
        return handleDeleteLibrary(params.id, userId);
      },
    },
  },
});
