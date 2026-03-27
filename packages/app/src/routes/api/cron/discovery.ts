import { createFileRoute } from "@tanstack/react-router";
import { handleDiscoveryCron } from "~/server/api/cron";

export const Route = createFileRoute("/api/cron/discovery")({
  server: {
    handlers: {
      POST: async ({ request }) => handleDiscoveryCron(request),
    },
  },
});
