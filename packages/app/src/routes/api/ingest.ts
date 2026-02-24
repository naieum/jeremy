import { createFileRoute } from "@tanstack/react-router";
import { handleIngest } from "~/server/api/ingest";

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => handleIngest(request),
    },
  },
});
