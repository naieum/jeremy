import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
});

function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link to="/" className="text-sm text-muted hover:text-text transition-colors">
        &larr; Home
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-text">Getting started</h1>
      <p className="mt-2 text-sm text-muted">Set up jeremy in a few minutes.</p>

      <div className="mt-10 space-y-8 text-sm text-muted leading-relaxed">
        <section>
          <h2 className="text-base font-semibold text-text">1. Create an account</h2>
          <p className="mt-2">
            <Link to="/login" className="text-text underline hover:no-underline">Sign up</Link> from
            the home page. Once you're in, you'll land on the dashboard.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">2. Get an API key</h2>
          <p className="mt-2">
            Go to <strong className="text-text">Dashboard &rarr; Keys</strong> and
            create a key. Copy it somewhere safe — you'll only see it once.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">3. Connect to Claude Code</h2>
          <p className="mt-2">
            Clone the repo and build the MCP server:
          </p>
          <pre className="mt-3 rounded-lg bg-surface p-4 text-xs text-text font-mono overflow-x-auto whitespace-pre-wrap"><code>{`git clone https://github.com/naieum/jeremy.git
cd jeremy
npm install
npm run build --workspace=packages/mcp`}</code></pre>
          <p className="mt-3">
            Then register it with Claude Code (update the path to where you cloned the repo):
          </p>
          <pre className="mt-3 rounded-lg bg-surface p-4 text-xs text-text font-mono overflow-x-auto whitespace-pre-wrap"><code>{`claude mcp add --scope user jeremy -- \\
  node ~/jeremy/packages/mcp/dist/index.js`}</code></pre>
          <p className="mt-3">
            Set your API key and URL as environment variables (add to your shell profile):
          </p>
          <pre className="mt-3 rounded-lg bg-surface p-4 text-xs text-text font-mono overflow-x-auto whitespace-pre-wrap"><code>{`export JEREMY_API_URL=https://jeremy.khuur.dev
export JEREMY_API_KEY=jrmy_your_key_here`}</code></pre>
          <p className="mt-3">
            Replace <code className="rounded bg-surface px-1.5 py-0.5 text-xs text-text font-mono">jrmy_your_key_here</code> with the key you copied in step 2.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">4. Add a library</h2>
          <p className="mt-2">
            In the dashboard, go to <strong className="text-text">Libraries &rarr; Add Library</strong>.
            Enter a library name and a documentation URL, and jeremy will crawl and index it for you.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">5. Use it</h2>
          <p className="mt-2">
            That's it. Next time you're working in Claude Code, it will automatically
            search your indexed docs when it needs them. Try asking it about a library
            you've added — jeremy handles the rest.
          </p>
        </section>
      </div>
    </div>
  );
}
