import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import {
  handleListSources,
  handleAddSource,
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

export const Route = createFileRoute("/api/admin/discovery/sources")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await getSessionUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return handleListSources(userId);
      },
      POST: async ({ request }) => {
        const userId = await getSessionUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return handleAddSource(userId, request);
      },
    },
  },
});
