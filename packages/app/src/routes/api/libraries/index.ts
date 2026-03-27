import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import { validateApiKey } from "~/server/middleware/api-auth";
import { handleListLibraries } from "~/server/api/libraries";

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

export const Route = createFileRoute("/api/libraries/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const apiAuth = await validateApiKey(request);
        const sessionUserId = apiAuth ? null : await getSessionUserId(request);
        const userId = apiAuth?.userId ?? sessionUserId;
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return handleListLibraries(userId);
      },
    },
  },
});
