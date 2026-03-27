import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import { validateApiKey } from "~/server/middleware/api-auth";
import { checkRateLimit, rateLimitResponse } from "~/server/middleware/rate-limit";
import { handleMcpRequest } from "~/server/api/mcp";

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

async function authenticateRequest(request: Request) {
  const apiAuth = await validateApiKey(request);
  const sessionUserId = apiAuth ? null : await getSessionUserId(request);
  const userId = apiAuth?.userId ?? sessionUserId;
  const keyId = apiAuth?.keyId ?? userId;
  return { userId, keyId };
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Enforce body size (1MB max)
        const contentLength = request.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > 1_048_576) {
          return Response.json(
            {
              jsonrpc: "2.0",
              error: { code: -32600, message: "Request too large (max 1MB)" },
              id: null,
            },
            { status: 413 }
          );
        }

        const { userId, keyId } = await authenticateRequest(request);
        if (!userId || !keyId) {
          return Response.json(
            {
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message:
                  "Unauthorized. Provide an API key via Authorization: Bearer jrmy_...",
              },
              id: null,
            },
            { status: 401 }
          );
        }

        // Rate limit: 60 requests per minute per key
        const rateLimit = await checkRateLimit(keyId, "mcp", 60);
        if (!rateLimit.allowed) {
          return rateLimitResponse(rateLimit.retryAfter!);
        }

        return handleMcpRequest(request, userId);
      },
      DELETE: async ({ request }) => {
        const { userId } = await authenticateRequest(request);
        if (!userId) {
          return new Response(null, { status: 401 });
        }
        return new Response(null, { status: 200 });
      },
    },
  },
});
