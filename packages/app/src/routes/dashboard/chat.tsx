import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChatInterface } from "~/components/chat";

export const Route = createFileRoute("/dashboard/chat")({
  beforeLoad: ({ context }) => {
    if (!(context as any).isAdmin) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ChatPage,
});

function ChatPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-text">Chat</h1>
      <p className="mt-1 text-sm text-muted">
        Add libraries by describing them. The AI will extract metadata and trigger ingestion.
      </p>
      <div className="mt-6">
        <ChatInterface />
      </div>
    </div>
  );
}
