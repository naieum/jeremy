import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AddLibraryForm } from "~/components/library-form";

export const Route = createFileRoute("/dashboard/libraries/add")({
  component: AddLibraryPage,
});

function AddLibraryPage() {
  const navigate = useNavigate();

  async function handleSubmit(data: {
    id: string;
    name: string;
    sourceUrl: string;
    sourceType: string;
    description: string;
  }) {
    let res: Response;

    if (data.sourceType === "crawl") {
      res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          libraryId: data.id,
          name: data.name,
          description: data.description,
          urls: [data.sourceUrl],
          replace: true,
        }),
      });
    } else {
      res = await fetch("/api/ingest-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          libraryId: data.id,
          name: data.name,
          description: data.description,
          sourceUrl: data.sourceUrl,
          sourceType: data.sourceType,
        }),
      });
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error((err as any).error || "Failed to ingest library");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">Add library</h1>
      <p className="mt-1 text-sm text-muted">
        Provide an llms.txt URL or docs URL. jeremy will fetch, chunk, and index the docs automatically.
      </p>
      <div className="mt-8 max-w-xl">
        <AddLibraryForm onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
