import { createFileRoute } from "@tanstack/react-router";
import { handleBuildDocSite } from "~/server/api/doc-sites";

export const Route = createFileRoute("/api/libraries/$id/docs/build")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        handleBuildDocSite(request, params.id),
    },
  },
});
