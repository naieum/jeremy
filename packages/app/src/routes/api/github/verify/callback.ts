import { createFileRoute } from "@tanstack/react-router";
import { handleGitHubVerifyCallback } from "~/server/api/github-verify";

export const Route = createFileRoute("/api/github/verify/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGitHubVerifyCallback(request),
    },
  },
});
