import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";

interface LibraryResult {
  id: string;
  name: string;
  chunksIngested: number;
  vectorized: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  library?: LibraryResult;
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <div className="h-2 w-2 rounded-full bg-muted animate-bounce [animation-delay:0ms]" />
      <div className="h-2 w-2 rounded-full bg-muted animate-bounce [animation-delay:150ms]" />
      <div className="h-2 w-2 rounded-full bg-muted animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

function LibraryCard({ library }: { library: LibraryResult }) {
  return (
    <div className="mt-2 rounded-lg border border-border bg-hover/50 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-text">{library.name}</p>
          <p className="text-sm text-muted">
            {library.chunksIngested} chunks indexed
            {library.vectorized && " + vectorized"}
          </p>
        </div>
        <Link
          to="/dashboard/libraries/$id"
          params={{ id: library.id }}
          className="text-sm text-accent hover:text-accent-hover transition-colors"
        >
          View
        </Link>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
          isUser
            ? "bg-hover text-text"
            : "border border-border bg-surface text-text"
        }`}
      >
        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        {message.library && <LibraryCard library={message.library} />}
      </div>
    </div>
  );
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: (err as any).error || "Something went wrong." },
        ]);
        return;
      }

      const data = await res.json() as ChatMessage;
      setMessages((prev) => [...prev, data]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error. Please try again." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted">
              <p className="text-lg font-medium">Add libraries via chat</p>
              <p className="mt-1 text-sm">
                Try: "add react docs https://react.dev/llms.txt"
              </p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-border bg-surface">
              <LoadingDots />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-1 pt-4 pb-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='e.g. "add tanstack router https://tanstack.com/router/llms.txt"'
            disabled={loading}
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-muted focus:border-muted focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-bg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
