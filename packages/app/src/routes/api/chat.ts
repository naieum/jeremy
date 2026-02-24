import { createFileRoute } from "@tanstack/react-router";
import { handleChat } from "~/server/api/chat";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => handleChat(request),
    },
  },
});
