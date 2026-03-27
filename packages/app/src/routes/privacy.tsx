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
      <p className="mt-2 text-sm text-muted">Last updated: March 2026</p>

      <div className="mt-10 space-y-8 text-sm text-muted leading-relaxed">
        <section>
          <h2 className="text-base font-semibold text-text">1. Data collection</h2>
          <p className="mt-2">
            When you create an account, we store your email address and authentication credentials.
            We also store any API keys you generate and documentation you add to the service.
            All data is stored on Cloudflare infrastructure (D1, R2, Vectorize, KV).
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
            Documentation you ingest is chunked, embedded, and stored in our database
            and vector index. Public libraries are searchable by all users. Private libraries
            are only accessible to the account that created them.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">4. Third-party services</h2>
          <p className="mt-2">
            Jeremy uses Cloudflare Workers AI for generating embeddings. No documentation
            data is shared with third parties outside of the Cloudflare network.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">5. Data deletion</h2>
          <p className="mt-2">
            You can delete your API keys and libraries from the dashboard at any time.
            To request full account deletion, contact us at the email below.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-text">6. Contact</h2>
          <p className="mt-2">
            For questions about this policy, reach out to{" "}
            <a href="mailto:support@khuur.dev" className="text-text underline hover:no-underline">support@khuur.dev</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
