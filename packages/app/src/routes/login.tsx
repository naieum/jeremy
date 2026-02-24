import { createFileRoute, Link } from "@tanstack/react-router";
import { signIn, signUp, useSession } from "~/server/lib/auth-client";
import { useState } from "react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { data: session } = useSession();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) {
    window.location.href = "/dashboard";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const result = await signUp.email({
          email,
          password,
          name,
          callbackURL: "/dashboard",
        });
        if (result.error) {
          setError(result.error.message ?? "Sign up failed");
        } else {
          window.location.href = "/dashboard";
        }
      } else {
        const result = await signIn.email({
          email,
          password,
          callbackURL: "/dashboard",
        });
        if (result.error) {
          setError(result.error.message ?? "Sign in failed");
        } else {
          window.location.href = "/dashboard";
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="text-sm text-muted hover:text-text transition-colors">
          &larr; Home
        </Link>

        <h1 className="mt-6 mb-8 text-2xl font-bold text-text">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>

        <div className="mb-6 flex gap-3">
          <button
            onClick={() => signIn.social({ provider: "github", callbackURL: "/dashboard" })}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text hover:border-muted transition-colors"
          >
            GitHub
          </button>
          <button
            onClick={() => signIn.social({ provider: "google", callbackURL: "/dashboard" })}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text hover:border-muted transition-colors"
          >
            Google
          </button>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder-muted focus:border-muted focus:outline-none"
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder-muted focus:border-muted focus:outline-none"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder-muted focus:border-muted focus:outline-none"
            required
          />
          {error && (
            <p className="text-sm text-danger">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-text px-4 py-2.5 text-sm font-medium text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "..." : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button
                onClick={() => setMode("signup")}
                className="text-text hover:underline"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => setMode("signin")}
                className="text-text hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
