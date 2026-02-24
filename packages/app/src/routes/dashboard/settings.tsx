import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "~/server/lib/auth-client";
import { useState, useEffect } from "react";
import { type Theme, getTheme, setTheme } from "~/lib/theme";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

const themes: { value: Theme; label: string; description: string }[] = [
  { value: "blue", label: "Blue (Dark)", description: "Dark navy background, cream text" },
  { value: "blue-inverse", label: "Blue (Light)", description: "Cream background, navy text" },
  { value: "cream", label: "Cream (Light)", description: "Warm cream background, dark text" },
  { value: "cream-inverse", label: "Cream (Dark)", description: "Dark background, warm cream text" },
];

function SettingsPage() {
  const { data: session } = useSession();
  const [currentTheme, setCurrentTheme] = useState<Theme>("blue");

  useEffect(() => {
    setCurrentTheme(getTheme());
  }, []);

  function handleThemeChange(theme: Theme) {
    setCurrentTheme(theme);
    setTheme(theme);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">Settings</h1>
      <p className="mt-1 mb-8 text-sm text-muted">Account settings.</p>

      <div className="max-w-xl space-y-6">
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-base font-semibold text-text">Profile</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Name</span>
              <span className="text-text">{session?.user?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Email</span>
              <span className="text-text">{session?.user?.email ?? "—"}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-base font-semibold text-text">Appearance</h2>
          <p className="mt-2 text-sm text-muted">Choose a theme for the interface.</p>
          <div className="mt-4 space-y-2">
            {themes.map((t) => (
              <label
                key={t.value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                  currentTheme === t.value
                    ? "border-accent bg-hover"
                    : "border-border hover:border-muted"
                }`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={t.value}
                  checked={currentTheme === t.value}
                  onChange={() => handleThemeChange(t.value)}
                  className="sr-only"
                />
                <div
                  className={`h-4 w-4 rounded-full border-2 transition-colors ${
                    currentTheme === t.value
                      ? "border-accent bg-accent"
                      : "border-muted bg-transparent"
                  }`}
                >
                  {currentTheme === t.value && (
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-bg" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-text">{t.label}</p>
                  <p className="text-xs text-muted">{t.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-base font-semibold text-text">MCP configuration</h2>
          <p className="mt-2 text-sm text-muted">
            Register the jeremy MCP server with Claude Code:
          </p>
          <pre className="mt-3 rounded-lg bg-bg p-4 text-xs text-text font-mono overflow-x-auto whitespace-pre-wrap">{`claude mcp add --scope user jeremy -- \\
  node ~/jeremy/packages/mcp/dist/index.js`}</pre>
          <p className="mt-3 text-sm text-muted">
            Then set your environment variables:
          </p>
          <pre className="mt-3 rounded-lg bg-bg p-4 text-xs text-text font-mono overflow-x-auto whitespace-pre-wrap">{`export JEREMY_API_URL=https://jeremy.khuur.dev
export JEREMY_API_KEY=jrmy_your_key_here`}</pre>
          <p className="mt-3 text-sm text-muted">
            Replace <code className="rounded bg-hover px-1.5 py-0.5 text-xs text-text font-mono">jrmy_your_key_here</code> with
            an API key from the <a href="/dashboard/keys" className="text-text underline hover:no-underline">Keys</a> page.
            See the <a href="/docs" className="text-text underline hover:no-underline">docs</a> for full setup instructions.
          </p>
        </div>
      </div>
    </div>
  );
}
