import type { DiscoveryItem } from "./types";

interface CratesResponse {
  crates: Array<{
    name: string;
    description?: string;
    documentation?: string;
    homepage?: string;
    repository?: string;
    downloads: number;
  }>;
}

export async function fetchCratesPackages(config: {
  limit?: number;
}): Promise<DiscoveryItem[]> {
  const limit = config.limit ?? 50;

  const res = await fetch(
    `https://crates.io/api/v1/crates?sort=downloads&per_page=${limit}&page=1`,
    {
      headers: {
        "User-Agent": "Jeremy-App (https://jeremy.khuur.dev)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!res.ok) {
    throw new Error(`crates.io fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as CratesResponse;

  return data.crates.map((crate) => ({
    identifier: crate.name,
    name: crate.name,
    docsUrl: crate.documentation || `https://docs.rs/${crate.name}`,
    websiteUrl: crate.homepage || crate.repository || undefined,
    metadata: {
      description: crate.description,
      downloads: crate.downloads,
    },
  }));
}
