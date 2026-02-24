import { createFileRoute } from "@tanstack/react-router";
import { handleCrawl } from "~/server/api/crawl";

export const Route = createFileRoute("/api/crawl")({
  server: {
    handlers: {
      POST: async ({ request }) => handleCrawl(request),
    },
  },
});
