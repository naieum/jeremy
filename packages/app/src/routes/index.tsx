import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const ShaderLines = lazy(() =>
  import("~/components/shader-lines").then((m) => ({ default: m.ShaderLines }))
);

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Shader background */}
      <Suspense fallback={null}>
        <ShaderLines />
      </Suspense>

      {/* Gradient overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-bg/60 via-bg/40 to-bg/80" style={{ zIndex: 1 }} />

      {/* Content */}
      <div className="relative flex min-h-screen flex-col items-center justify-center px-6" style={{ zIndex: 2 }}>
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-5xl font-bold tracking-tight text-text sm:text-6xl">
            jeremy
          </h1>
          <p className="mt-4 text-lg text-text/80 font-medium">
            Documentation context for AI coding tools.
          </p>

          <p className="mt-6 text-sm leading-relaxed text-text/60">
            Jeremy indexes library docs so your AI assistant can search them
            in real time. Better context, better code.
          </p>

          <div className="mt-10 flex items-center justify-center gap-5">
            <Link
              to="/login"
              className="rounded-lg bg-text px-6 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
            >
              Get Started
            </Link>
            <Link
              to="/docs"
              className="text-sm font-medium text-text/70 transition-colors hover:text-text"
            >
              Documentation &rarr;
            </Link>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-x-8 gap-y-4 text-left text-sm text-text/50">
            <div>
              <span className="text-text/80 font-medium">MCP native</span>
              <br />
              Works with Claude Code out of the box
            </div>
            <div>
              <span className="text-text/80 font-medium">Any docs source</span>
              <br />
              URLs, llms.txt, or manual upload
            </div>
            <div>
              <span className="text-text/80 font-medium">Semantic search</span>
              <br />
              Finds the right docs automatically
            </div>
            <div>
              <span className="text-text/80 font-medium">Team ready</span>
              <br />
              Share via API keys, no infra to manage
            </div>
          </div>
        </div>

        <footer className="absolute bottom-6 text-xs text-text/30">
          <Link to="/docs" className="transition-colors hover:text-text/60">Docs</Link>
          {" · "}
          <Link to="/privacy" className="transition-colors hover:text-text/60">Privacy</Link>
          {" · "}
          <Link to="/terms" className="transition-colors hover:text-text/60">Terms</Link>
          {" · "}
          <Link to="/catalog" className="transition-colors hover:text-text/60">Catalog</Link>
        </footer>
      </div>
    </div>
  );
}
