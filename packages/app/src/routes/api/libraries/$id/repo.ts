import { createFileRoute } from "@tanstack/react-router";
import {
  handleConnectRepo,
  handleGetRepoConnection,
  handleDisconnectRepo,
} from "~/server/api/repos";

export const Route = createFileRoute("/api/libraries/$id/repo")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleGetRepoConnection(request, params.id),
      POST: async ({ request, params }) =>
        handleConnectRepo(request, params.id),
      DELETE: async ({ request, params }) =>
        handleDisconnectRepo(request, params.id),
    },
  },
});
