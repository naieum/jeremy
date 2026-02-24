import { createFileRoute } from "@tanstack/react-router";
import { handleRepoIngest } from "~/server/api/repos";

export const Route = createFileRoute("/api/libraries/$id/repo/ingest")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        handleRepoIngest(request, params.id),
    },
  },
});
