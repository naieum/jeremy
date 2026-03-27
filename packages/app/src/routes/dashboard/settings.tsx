import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "~/server/lib/auth-client";
import { useState, useEffect } from "react";
import { type Theme, getTheme, setTheme } from "~/lib/theme";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute top-2 right-2 rounded px-2 py-1 text-xs text-muted hover:text-text hover:bg-hover transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function McpConfigSection() {
  const apiUrl = typeof window !== "undefined" ? window.location.origin : "https://jeremy.khuur.dev";

  const mcpCommand = `claude mcp add --transport http \\
  --header "Authorization: Bearer jrmy_your_key_here" \\
  jeremy ${apiUrl}/api/mcp`;

  const jsonConfig = `{
  "mcpServers": {
    "jeremy": {
      "type": "http",
      "url": "${apiUrl}/api/mcp",
      "headers": {
        "Authorization": "Bearer jrmy_your_key_here"
      }
    }
  }
}`;

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-base font-semibold text-text">Connect MCP server</h2>
      <p className="mt-2 text-sm text-muted">
        Connect Jeremy to Claude Code to search and manage your docs from the terminal.
        Nothing to install — Jeremy's MCP server runs in the cloud.
      </p>

      <div className="mt-4 space-y-3">
        <p className="text-sm text-muted">
          Create an API key on the{" "}
          <a href="/dashboard/keys" className="text-text underline hover:no-underline">Keys</a>{" "}
          page, then run:
        </p>
        <div className="relative">
          <pre className="rounded-lg bg-bg p-4 pr-16 text-xs text-text font-mono overflow-x-auto whitespace-pre-wrap">
            {mcpCommand}
          </pre>
          <CopyButton text={mcpCommand} />
        </div>
        <p className="text-xs text-muted">
          Replace <code className="rounded bg-hover px-1 py-0.5 text-text font-mono">jrmy_your_key_here</code> with
          your actual API key.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        <p className="text-sm font-medium text-text">Manual configuration</p>
        <p className="text-sm text-muted">
          Or add this directly to your Claude Code settings file:
        </p>
        <div className="relative">
          <pre className="rounded-lg bg-bg p-4 pr-16 text-xs text-text font-mono overflow-x-auto whitespace-pre-wrap">
            {jsonConfig}
          </pre>
          <CopyButton text={jsonConfig} />
        </div>
      </div>
    </div>
  );
}

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

        <McpConfigSection />
      </div>
    </div>
  );
}
