import { createFileRoute } from "@tanstack/react-router";
import { handleContext } from "~/server/api/context";

export const Route = createFileRoute("/api/context")({
  server: {
    handlers: {
      GET: async ({ request }) => handleContext(request),
    },
  },
});
