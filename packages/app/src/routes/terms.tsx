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
      <p className="mt-2 text-sm text-muted">Last updated: February 2026</p>

      <div className="mt-10 space-y-8 text-sm text-muted leading-relaxed">
        <section>
          <h2 className="text-base font-semibold text-text">1. Acceptance</h2>
          <p className="mt-2">
            By deploying and using jeremy, you agree to these terms. jeremy is provided as
            open-source software for self-hosting on your own infrastructure.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">2. Self-hosting</h2>
          <p className="mt-2">
            You are responsible for your own deployment, including Cloudflare account costs,
            security configuration, and access management. The jeremy project provides the
            software as-is.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">3. Documentation ingestion</h2>
          <p className="mt-2">
            You are responsible for ensuring you have the right to ingest and index any
            documentation you add to your jeremy instance. Respect the licensing terms of
            the documentation sources you use.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">4. No warranty</h2>
          <p className="mt-2">
            jeremy is provided "as is" without warranty of any kind. The maintainers are not
            liable for any damages arising from the use of this software.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">5. Changes</h2>
          <p className="mt-2">
            These terms may be updated with new releases. Continued use after updates
            constitutes acceptance of the revised terms.
          </p>
        </section>
      </div>
    </div>
  );
}
