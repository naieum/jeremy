import { createFileRoute } from "@tanstack/react-router";
import { createAuth } from "~/server/auth";
import { env } from "cloudflare:workers";

function getOrigin(request: Request) {
  const url = new URL(request.url);
  return url.origin;
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = createAuth(env as any, getOrigin(request));
        return auth.handler(request);
      },
      POST: async ({ request }) => {
        const auth = createAuth(env as any, getOrigin(request));
        return auth.handler(request);
      },
    },
  },
});
