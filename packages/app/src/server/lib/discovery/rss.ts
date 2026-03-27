import { parseFeed } from "htmlparser2";
import type { DiscoveryItem } from "./types";

const DOCS_URL_PATTERNS = [
  /\/docs\//i,
  /readthedocs/i,
  /docs\./i,
  /documentation/i,
  /\/guide\//i,
  /\/api\//i,
  /\/reference\//i,
  /\/manual\//i,
];

function isLikelyDocsUrl(url: string): boolean {
  return DOCS_URL_PATTERNS.some((pattern) => pattern.test(url));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function fetchRSSFeed(config: {
  feedUrl: string;
  sourceId?: string;
}): Promise<DiscoveryItem[]> {
  if (!config.feedUrl) {
    throw new Error("RSS feed URL is required");
  }

  const res = await fetch(config.feedUrl, {
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`RSS feed fetch failed: ${res.status}`);
  }

  const text = await res.text();
  const feed = parseFeed(text);

  if (!feed?.items) {
    return [];
  }

  const items: DiscoveryItem[] = [];

  for (const item of feed.items) {
    const link = item.link;
    if (!link) continue;

    // Only include items that look like they point to documentation
    if (!isLikelyDocsUrl(link)) continue;

    const title = item.title ?? link;
    const slug = slugify(title);
    const sourcePrefix = config.sourceId ?? "rss";

    items.push({
      identifier: `${sourcePrefix}:${slug}`,
      name: title,
      websiteUrl: link,
      metadata: {
        pubDate: item.pubDate?.toISOString(),
        description: item.description,
      },
    });
  }

  return items;
}
