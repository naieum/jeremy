import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

interface AddLibraryFormProps {
  onSubmit: (data: {
    id: string;
    name: string;
    sourceUrl: string;
    sourceType: string;
    description: string;
  }) => Promise<void>;
}

export function AddLibraryForm({ onSubmit }: AddLibraryFormProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      id: "",
      name: "",
      sourceUrl: "",
      sourceType: "llms_txt" as string,
      description: "",
    },
    onSubmit: async ({ value }) => {
      setLoading(true);
      setError(null);
      try {
        await onSubmit(value);
        navigate({ to: "/dashboard/libraries" });
      } catch (e: any) {
        setError(e.message || "Failed to ingest library");
      } finally {
        setLoading(false);
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-6"
    >
      {error && (
        <div className="rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <form.Field name="name">
        {(field) => (
          <div>
            <label className="block text-sm font-medium text-text">
              Library Name
            </label>
            <input
              type="text"
              placeholder="React"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text placeholder-muted focus:border-muted focus:outline-none"
              required
              disabled={loading}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="id">
        {(field) => (
          <div>
            <label className="block text-sm font-medium text-text">
              Library ID
            </label>
            <input
              type="text"
              placeholder="/facebook/react"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text placeholder-muted focus:border-muted focus:outline-none"
              required
              disabled={loading}
            />
            <p className="mt-1 text-xs text-muted">
              Format: /org/repo or a unique identifier
            </p>
          </div>
        )}
      </form.Field>

      <form.Field name="sourceType">
        {(field) => (
          <div>
            <label className="block text-sm font-medium text-text">
              Source Type
            </label>
            <select
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text focus:border-muted focus:outline-none"
              disabled={loading}
            >
              <option value="llms_txt">llms.txt</option>
              <option value="crawl">Web Crawl</option>
              <option value="manual">Manual</option>
            </select>
          </div>
        )}
      </form.Field>

      <form.Field name="sourceUrl">
        {(field) => (
          <div>
            <label className="block text-sm font-medium text-text">
              Source URL
            </label>
            <input
              type="url"
              placeholder="https://react.dev/llms.txt"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text placeholder-muted focus:border-muted focus:outline-none"
              required
              disabled={loading}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div>
            <label className="block text-sm font-medium text-text">
              Description
            </label>
            <textarea
              placeholder="A JavaScript library for building user interfaces"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text placeholder-muted focus:border-muted focus:outline-none"
              disabled={loading}
            />
          </div>
        )}
      </form.Field>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Fetching & Indexing..." : "Add Library"}
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/dashboard/libraries" })}
          disabled={loading}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:border-muted hover:text-text transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {loading && (
        <p className="text-sm text-muted">
          Fetching docs, chunking, and generating embeddings. This may take a minute for large libraries...
        </p>
      )}
    </form>
  );
}
