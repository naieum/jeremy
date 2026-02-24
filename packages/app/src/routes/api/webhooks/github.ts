import { createFileRoute } from "@tanstack/react-router";
import { handleGitHubWebhook } from "~/server/api/webhooks";

export const Route = createFileRoute("/api/webhooks/github")({
  server: {
    handlers: {
      POST: async ({ request }) => handleGitHubWebhook(request),
    },
  },
});
