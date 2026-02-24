import { createFileRoute } from "@tanstack/react-router";
import {
  handleCreateDocSite,
  handleGetDocSite,
  handleDeleteDocSite,
} from "~/server/api/doc-sites";

export const Route = createFileRoute("/api/libraries/$id/docs")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleGetDocSite(request, params.id),
      POST: async ({ request, params }) =>
        handleCreateDocSite(request, params.id),
      DELETE: async ({ request, params }) =>
        handleDeleteDocSite(request, params.id),
    },
  },
});
