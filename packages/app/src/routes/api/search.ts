import { createFileRoute } from "@tanstack/react-router";
import { handleSearch } from "~/server/api/search";

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => handleSearch(request),
    },
  },
});
