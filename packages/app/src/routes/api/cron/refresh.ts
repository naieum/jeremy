import { createFileRoute } from "@tanstack/react-router";
import { handleCronRefresh } from "~/server/api/cron";

export const Route = createFileRoute("/api/cron/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => handleCronRefresh(request),
    },
  },
});
