# Jeremy - Documentation RAG Service

## Project Structure

- `packages/app` — TanStack Start + Cloudflare Workers app (D1, R2, Vectorize, AI)
- `packages/mcp` — MCP server for Claude Code (`@jeremy/mcp`)

## Key Conventions

- **Auth**: Better Auth with email/password, GitHub, Google social login, and device authorization flow
- **Database**: Cloudflare D1 (SQLite) via Drizzle ORM. Migrations in `packages/app/drizzle/`
- **API auth**: `jrmy_*` API keys (SHA-256 hashed) or session cookies
- **Routes**: TanStack Router file-based routing. API routes use `server.handlers` pattern
- **Styling**: Tailwind CSS with CSS variable theming (`--text`, `--bg`, `--surface`, `--border`, `--muted`, `--accent`, `--danger`)
- **Tests**: Playwright e2e tests in `packages/app/tests/`. Run with `npm run test:api` or `npm run test:ui`

## Project Documentation Sync

After making significant code changes (new features, API changes, architectural decisions), use the Jeremy MCP tools to keep project docs current:

1. `init-project` with projectName "jeremy"
2. `document-feature` for each changed area
3. `sync-project-docs` to push to the server

Do this proactively after commits that add/change features, APIs, or architecture.
