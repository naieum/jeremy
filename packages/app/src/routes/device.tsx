import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession } from "~/server/lib/auth-client";
import { useState, useEffect, useRef } from "react";

export const Route = createFileRoute("/device")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: (typeof search.code === "string" ? search.code : "") as string,
  }),
  component: DevicePage,
});

function DevicePage() {
  const { data: session, isPending } = useSession();
  const { code: prefillCode } = Route.useSearch();
  const [userCode, setUserCode] = useState(prefillCode);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isPending && !session) {
      const callbackURL = `/device${prefillCode ? `?code=${prefillCode}` : ""}`;
      window.location.href = `/login?callbackURL=${encodeURIComponent(callbackURL)}`;
    }
  }, [session, isPending, prefillCode]);

  useEffect(() => {
    if (session && inputRef.current) {
      inputRef.current.focus();
    }
  }, [session]);

  async function handleApprove(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("loading");

    const code = userCode.trim().toUpperCase();
    if (!code) {
      setError("Please enter the code shown in your terminal.");
      setStatus("idle");
      return;
    }

    try {
      const res = await fetch("/api/auth/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: code }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as Record<string, string> | null;
        const msg = data?.message ?? data?.error ?? "Failed to authorize device.";
        setError(msg);
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  if (isPending) return null;
  if (!session) return null;

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 text-4xl">&#10003;</div>
          <h1 className="text-2xl font-bold text-text">Device authorized</h1>
          <p className="mt-3 text-sm text-muted">
            Your MCP is now connected. You can close this tab.
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-block text-sm text-muted hover:text-text transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="text-sm text-muted hover:text-text transition-colors">
          &larr; Home
        </Link>

        <h1 className="mt-6 mb-2 text-2xl font-bold text-text">Authorize device</h1>
        <p className="mb-6 text-sm text-muted">
          Enter the code shown in your terminal to connect your MCP.
        </p>

        <form onSubmit={handleApprove} className="space-y-4">
          <input
            ref={inputRef}
            type="text"
            placeholder="ABCD1234"
            value={userCode}
            onChange={(e) => setUserCode(e.target.value.toUpperCase())}
            maxLength={8}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-center text-lg font-mono tracking-[0.3em] text-text placeholder-muted/40 focus:border-muted focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-lg bg-text px-4 py-2.5 text-sm font-medium text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {status === "loading" ? "Authorizing..." : "Authorize"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          Signed in as {session.user.email}
        </p>
      </div>
    </div>
  );
}
