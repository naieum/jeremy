import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link to="/" className="text-sm text-muted hover:text-text transition-colors">
        &larr; Home
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-text">Privacy policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: February 2026</p>

      <div className="mt-10 space-y-8 text-sm text-muted leading-relaxed">
        <section>
          <h2 className="text-base font-semibold text-text">1. Data collection</h2>
          <p className="mt-2">
            jeremy is a self-hosted application. All data — including user accounts, API keys,
            and indexed documentation — is stored on your own Cloudflare account infrastructure.
            No data is sent to or stored by the jeremy project maintainers.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">2. Authentication</h2>
          <p className="mt-2">
            We support email/password and OAuth (GitHub, Google) authentication via Better Auth.
            OAuth tokens are used solely for authentication and are not stored beyond session management.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">3. Documentation data</h2>
          <p className="mt-2">
            Documentation you ingest is chunked, embedded, and stored in your Cloudflare D1 database
            and Vectorize index. This data remains entirely within your Cloudflare account.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">4. Third-party services</h2>
          <p className="mt-2">
            jeremy uses Cloudflare Workers AI for generating embeddings. Processing occurs within
            the Cloudflare network under your account. No documentation data is shared with
            external third parties.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">5. Contact</h2>
          <p className="mt-2">
            For questions about this policy, please open an issue on the project repository.
          </p>
        </section>
      </div>
    </div>
  );
}
