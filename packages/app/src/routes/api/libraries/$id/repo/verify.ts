import { createFileRoute } from "@tanstack/react-router";
import { handleVerifyRepo } from "~/server/api/repos";

export const Route = createFileRoute("/api/libraries/$id/repo/verify")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        handleVerifyRepo(request, params.id),
    },
  },
});
