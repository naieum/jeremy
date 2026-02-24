import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import { handleListKeys, handleCreateKey, handleDeleteKey } from "~/server/api/keys";

async function getSessionUserId(request: Request): Promise<string | null> {
  const origin = new URL(request.url).origin;
  const auth = createAuth(env as any, origin);
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}

export const Route = createFileRoute("/api/keys")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await getSessionUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        return handleListKeys(userId);
      },
      POST: async ({ request }) => {
        const userId = await getSessionUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        return handleCreateKey(userId, request);
      },
      DELETE: async ({ request }) => {
        const userId = await getSessionUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const keyId = url.searchParams.get("id");
        if (!keyId) return Response.json({ error: "id parameter required" }, { status: 400 });
        return handleDeleteKey(userId, keyId);
      },
    },
  },
});
