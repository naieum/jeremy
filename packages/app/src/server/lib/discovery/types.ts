export interface DiscoveryItem {
  identifier: string; // unique per source (npm package name, crate name, etc.)
  name: string;
  websiteUrl?: string;
  docsUrl?: string; // if already known directly from the source
  metadata?: Record<string, unknown>;
}

export type SourceType =
  | "npm_registry"
  | "pypi"
  | "cratesio"
  | "github_search"
  | "rss"
  | "custom_url";
