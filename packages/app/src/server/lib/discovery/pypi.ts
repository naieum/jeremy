import type { DiscoveryItem } from "./types";

interface TopPyPIPackages {
  rows: Array<{
    project: string;
    download_count: number;
  }>;
}

interface PyPIProjectInfo {
  info: {
    name: string;
    summary?: string;
    home_page?: string;
    project_urls?: Record<string, string>;
  };
}

export async function fetchPyPIPackages(config: {
  limit?: number;
}): Promise<DiscoveryItem[]> {
  const limit = config.limit ?? 100;

  const topRes = await fetch(
    "https://hugovk.github.io/top-pypi-packages/top-pypi-packages.min.json",
    { signal: AbortSignal.timeout(15_000) }
  );

  if (!topRes.ok) {
    throw new Error(`PyPI top packages fetch failed: ${topRes.status}`);
  }

  const topData = (await topRes.json()) as TopPyPIPackages;
  const packages = topData.rows.slice(0, limit);
  const items: DiscoveryItem[] = [];

  for (const pkg of packages) {
    try {
      const infoRes = await fetch(
        `https://pypi.org/pypi/${encodeURIComponent(pkg.project)}/json`,
        { signal: AbortSignal.timeout(10_000) }
      );

      if (!infoRes.ok) continue;

      const info = (await infoRes.json()) as PyPIProjectInfo;
      const projectUrls = info.info.project_urls ?? {};

      // Look for a documentation URL
      const docsUrl =
        projectUrls["Documentation"] ||
        projectUrls["Docs"] ||
        projectUrls["docs"] ||
        projectUrls["documentation"] ||
        undefined;

      const websiteUrl =
        projectUrls["Homepage"] ||
        projectUrls["Home"] ||
        info.info.home_page ||
        projectUrls["Source"] ||
        undefined;

      items.push({
        identifier: pkg.project,
        name: info.info.name || pkg.project,
        websiteUrl,
        docsUrl,
        metadata: {
          description: info.info.summary,
          downloads: pkg.download_count,
        },
      });
    } catch {
      // Skip packages we can't fetch info for
      items.push({
        identifier: pkg.project,
        name: pkg.project,
      });
    }
  }

  return items;
}
