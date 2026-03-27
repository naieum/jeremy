import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link to="/" className="text-sm text-muted hover:text-text transition-colors">
        &larr; Home
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-text">Terms of service</h1>
      <p className="mt-2 text-sm text-muted">Last updated: March 2026</p>

      <div className="mt-10 space-y-8 text-sm text-muted leading-relaxed">
        <section>
          <h2 className="text-base font-semibold text-text">1. Acceptance</h2>
          <p className="mt-2">
            By creating an account and using Jeremy, you agree to these terms.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">2. The service</h2>
          <p className="mt-2">
            Jeremy is a hosted documentation indexing service. We provide the infrastructure
            to ingest, store, and search library documentation via API and MCP integration.
            The service is provided free of charge and may be subject to usage limits.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">3. Documentation ingestion</h2>
          <p className="mt-2">
            You are responsible for ensuring you have the right to ingest and index any
            documentation you add. Respect the licensing terms of the documentation sources you use.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">4. Acceptable use</h2>
          <p className="mt-2">
            Do not abuse the service, attempt to access other users' data, or use it in
            ways that could harm its availability for others.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">5. No warranty</h2>
          <p className="mt-2">
            Jeremy is provided "as is" without warranty of any kind. We are not
            liable for any damages arising from the use of this service, including
            data loss or service interruptions.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">6. Changes</h2>
          <p className="mt-2">
            These terms may be updated at any time. Continued use after updates
            constitutes acceptance of the revised terms.
          </p>
        </section>
      </div>
    </div>
  );
}
