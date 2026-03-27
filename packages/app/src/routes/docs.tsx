import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
});

function DocsPage() {
  const apiUrl = typeof window !== "undefined" ? window.location.origin : "https://jeremy.khuur.dev";

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link to="/" className="text-sm text-muted hover:text-text transition-colors">
        &larr; Home
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-text">Getting started</h1>
      <p className="mt-2 text-sm text-muted">Set up Jeremy in a few minutes.</p>

      <div className="mt-10 space-y-8 text-sm text-muted leading-relaxed">
        <section>
          <h2 className="text-base font-semibold text-text">1. Create an account</h2>
          <p className="mt-2">
            <Link to="/login" className="text-text underline hover:no-underline">Sign up</Link> from
            the home page. Once you're in, you'll land on the dashboard.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">2. Connect to Claude Code</h2>
          <p className="mt-2">
            Create an API key from <strong className="text-text">Dashboard &rarr; Keys</strong>, then
            run this command in your terminal:
          </p>
          <pre className="mt-3 rounded-lg bg-surface p-4 text-xs text-text font-mono overflow-x-auto whitespace-pre-wrap"><code>{`claude mcp add --transport http --header "Authorization: Bearer jrmy_your_key_here" jeremy ${apiUrl}/api/mcp`}</code></pre>
          <p className="mt-3">
            That's it — no packages to install, nothing runs locally. Jeremy's MCP server
            runs entirely in the cloud.
          </p>
          <p className="mt-3">
            See <Link to="/dashboard/settings" className="text-text underline hover:no-underline">Settings</Link> for
            more details.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">3. Add a library</h2>
          <p className="mt-2">
            In the dashboard, go to <strong className="text-text">Libraries &rarr; Add Library</strong>.
            Enter a library name and a documentation URL, and Jeremy will crawl and index it for you.
          </p>
          <p className="mt-2">
            You can also browse the <Link to="/catalog" className="text-text underline hover:no-underline">catalog</Link> —
            we've already indexed {200}+ popular libraries so you can start searching immediately.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">4. Use it</h2>
          <p className="mt-2">
            That's it. Next time you're working in Claude Code, it will automatically
            search your indexed docs when it needs them. Try asking it about a library
            you've added — Jeremy handles the rest.
          </p>
        </section>
      </div>
    </div>
  );
}
