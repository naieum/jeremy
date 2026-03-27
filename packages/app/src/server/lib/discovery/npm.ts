import type { DiscoveryItem } from "./types";

interface NpmSearchResult {
  objects: Array<{
    package: {
      name: string;
      description?: string;
      links?: {
        homepage?: string;
        npm?: string;
        repository?: string;
      };
    };
  }>;
}

export async function fetchNpmPackages(config: {
  limit?: number;
}): Promise<DiscoveryItem[]> {
  const limit = config.limit ?? 100;
  const url = `https://registry.npmjs.org/-/v1/search?text=&size=${limit}&popularity=1.0`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`npm registry search failed: ${res.status}`);
  }

  const data = (await res.json()) as NpmSearchResult;

  return data.objects.map((obj) => ({
    identifier: obj.package.name,
    name: obj.package.name,
    websiteUrl: obj.package.links?.homepage || undefined,
    metadata: {
      description: obj.package.description,
      npmUrl: obj.package.links?.npm,
      repository: obj.package.links?.repository,
    },
  }));
}
