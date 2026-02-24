import { createFileRoute } from "@tanstack/react-router";
import { handleEmbed } from "~/server/api/embed";

export const Route = createFileRoute("/api/embed")({
  server: {
    handlers: {
      POST: async ({ request }) => handleEmbed(request),
    },
  },
});
