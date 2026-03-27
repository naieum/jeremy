import { env } from "cloudflare:workers";
import { eq, and, lt, isNull, or } from "drizzle-orm";
import { createDb, schema } from "../../db";
import { discoverDocUrl } from "../doc-discovery";
import { ingestFromUrl } from "../../api/ingest-url";
import { crawlAndIngest } from "../crawl";
import { fetchNpmPackages } from "./npm";
import { fetchPyPIPackages } from "./pypi";
import { fetchCratesPackages } from "./cratesio";
import { fetchGitHubRepos } from "./github";
import { fetchRSSFeed } from "./rss";
import type { DiscoveryItem, SourceType } from "./types";

/**
 * Phase 1: Fetch from external sources and populate the discovery queue.
 */
export async function runDiscoverySources(): Promise<{
  sourcesRun: number;
  newItems: number;
}> {
  const db = createDb(env.DB);
  let sourcesRun = 0;
  let newItems = 0;

  const sources = await db
    .select()
    .from(schema.discoverySources)
    .where(eq(schema.discoverySources.enabled, 1));

  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday
  const sevenDaysAgo = new Date(
    now.getTime() - 7 * 86400_000
  ).toISOString();

  for (const source of sources) {
    // Schedule filtering
    if (source.schedule === "weekly") {
      const neverRun = !source.lastRunAt;
      const stale = source.lastRunAt && source.lastRunAt < sevenDaysAgo;
      const isMonday = dayOfWeek === 1;

      if (!neverRun && !stale && !isMonday) continue;
    }
    // "daily" sources always run

    try {
      const config = JSON.parse(source.config || "{}");
      const items = await fetchSourceItems(
        source.type as SourceType,
        config,
        source.id
      );

      for (const item of items) {
        try {
          await db
            .insert(schema.discoveryQueue)
            .values({
              id: crypto.randomUUID(),
              sourceId: source.id,
              identifier: item.identifier,
              name: item.name,
              websiteUrl: item.websiteUrl ?? null,
              docsUrl: item.docsUrl ?? null,
              metadata: JSON.stringify(item.metadata ?? {}),
            })
            .onConflictDoNothing();
          newItems++;
        } catch {
          // Duplicate — ignore (unique index handles dedup)
        }
      }

      await db
        .update(schema.discoverySources)
        .set({
          lastRunAt: now.toISOString(),
          lastRunResult: `OK: ${items.length} items`,
        })
        .where(eq(schema.discoverySources.id, source.id));

      sourcesRun++;
    } catch (e: any) {
      await db
        .update(schema.discoverySources)
        .set({
          lastRunAt: now.toISOString(),
          lastRunResult: `Error: ${e.message}`,
        })
        .where(eq(schema.discoverySources.id, source.id));
    }
  }

  return { sourcesRun, newItems };
}

/**
 * Phase 2: Probe docs URLs and ingest from the discovery queue.
 */
export async function processDiscoveryQueue(opts: {
  adminUserId: string;
  maxLlmsIngest?: number;
  maxCrawl?: number;
}): Promise<{
  probed: number;
  ingested: number;
  crawled: number;
  skipped: number;
  errors: string[];
}> {
  const { adminUserId, maxLlmsIngest = 5, maxCrawl = 1 } = opts;
  const db = createDb(env.DB);
  const errors: string[] = [];
  let probed = 0;
  let ingested = 0;
  let crawled = 0;
  let skipped = 0;

  // Step 1: Probe pending items without a docs_url
  const pendingItems = await db
    .select()
    .from(schema.discoveryQueue)
    .where(
      and(
        eq(schema.discoveryQueue.status, "pending"),
        isNull(schema.discoveryQueue.docsUrl)
      )
    )
    .limit(20);

  for (const item of pendingItems) {
    if (!item.websiteUrl) {
      await db
        .update(schema.discoveryQueue)
        .set({
          status: "skipped",
          skipReason: "No website URL",
          processedAt: new Date().toISOString(),
        })
        .where(eq(schema.discoveryQueue.id, item.id));
      skipped++;
      continue;
    }

    try {
      const result = await discoverDocUrl(item.websiteUrl, item.docsUrl ?? undefined);

      if (result.strategy === "skip") {
        await db
          .update(schema.discoveryQueue)
          .set({
            status: "skipped",
            strategy: "skip",
            skipReason: result.reason,
            processedAt: new Date().toISOString(),
          })
          .where(eq(schema.discoveryQueue.id, item.id));
        skipped++;
      } else {
        await db
          .update(schema.discoveryQueue)
          .set({
            docsUrl: result.url,
            strategy: result.strategy,
          })
          .where(eq(schema.discoveryQueue.id, item.id));
      }

      probed++;
    } catch (e: any) {
      await db
        .update(schema.discoveryQueue)
        .set({
          status: "error",
          errorMsg: e.message,
          processedAt: new Date().toISOString(),
        })
        .where(eq(schema.discoveryQueue.id, item.id));
      errors.push(`Probe ${item.identifier}: ${e.message}`);
    }
  }

  // Step 2: Ingest items with strategy = 'llms_txt'
  const llmsItems = await db
    .select()
    .from(schema.discoveryQueue)
    .where(
      and(
        eq(schema.discoveryQueue.status, "pending"),
        eq(schema.discoveryQueue.strategy, "llms_txt")
      )
    )
    .limit(maxLlmsIngest);

  for (const item of llmsItems) {
    try {
      const libraryId = deriveLibraryId(item.sourceId, item.identifier);

      // Check if library already exists and was updated recently
      const [existing] = await db
        .select()
        .from(schema.libraries)
        .where(eq(schema.libraries.id, libraryId))
        .limit(1);

      if (existing) {
        const sevenDaysAgo = new Date(
          Date.now() - 7 * 86400_000
        ).toISOString();
        if (existing.updatedAt && existing.updatedAt > sevenDaysAgo) {
          await db
            .update(schema.discoveryQueue)
            .set({
              status: "skipped",
              skipReason: "Library recently updated",
              libraryId,
              processedAt: new Date().toISOString(),
            })
            .where(eq(schema.discoveryQueue.id, item.id));
          skipped++;
          continue;
        }
      }

      await ingestFromUrl({
        libraryId,
        name: item.name,
        sourceUrl: item.docsUrl!,
        sourceType: "llms_txt",
        ownerId: adminUserId,
      });

      // Set category based on source type
      const category = deriveCategory(item.sourceId, item.metadata);
      if (category) {
        await db
          .update(schema.libraries)
          .set({ category })
          .where(eq(schema.libraries.id, libraryId));
      }

      await db
        .update(schema.discoveryQueue)
        .set({
          status: "done",
          libraryId,
          processedAt: new Date().toISOString(),
        })
        .where(eq(schema.discoveryQueue.id, item.id));

      ingested++;
    } catch (e: any) {
      await db
        .update(schema.discoveryQueue)
        .set({
          status: "error",
          errorMsg: e.message,
          processedAt: new Date().toISOString(),
        })
        .where(eq(schema.discoveryQueue.id, item.id));
      errors.push(`Ingest ${item.identifier}: ${e.message}`);
    }
  }

  // Step 3: Crawl items with strategy = 'crawl'
  const crawlItems = await db
    .select()
    .from(schema.discoveryQueue)
    .where(
      and(
        eq(schema.discoveryQueue.status, "pending"),
        eq(schema.discoveryQueue.strategy, "crawl")
      )
    )
    .limit(maxCrawl);

  for (const item of crawlItems) {
    try {
      const libraryId = deriveLibraryId(item.sourceId, item.identifier);

      // Check if library already exists and was updated recently
      const [existing] = await db
        .select()
        .from(schema.libraries)
        .where(eq(schema.libraries.id, libraryId))
        .limit(1);

      if (existing) {
        const sevenDaysAgo = new Date(
          Date.now() - 7 * 86400_000
        ).toISOString();
        if (existing.updatedAt && existing.updatedAt > sevenDaysAgo) {
          await db
            .update(schema.discoveryQueue)
            .set({
              status: "skipped",
              skipReason: "Library recently updated",
              libraryId,
              processedAt: new Date().toISOString(),
            })
            .where(eq(schema.discoveryQueue.id, item.id));
          skipped++;
          continue;
        }
      }

      await crawlAndIngest({
        libraryId,
        name: item.name,
        urls: [item.docsUrl!],
        replace: true,
        ownerId: adminUserId,
        maxPages: 30,
      });

      // Set category based on source type
      const category = deriveCategory(item.sourceId, item.metadata);
      if (category) {
        await db
          .update(schema.libraries)
          .set({ category })
          .where(eq(schema.libraries.id, libraryId));
      }

      await db
        .update(schema.discoveryQueue)
        .set({
          status: "done",
          libraryId,
          processedAt: new Date().toISOString(),
        })
        .where(eq(schema.discoveryQueue.id, item.id));

      crawled++;
    } catch (e: any) {
      await db
        .update(schema.discoveryQueue)
        .set({
          status: "error",
          errorMsg: e.message,
          processedAt: new Date().toISOString(),
        })
        .where(eq(schema.discoveryQueue.id, item.id));
      errors.push(`Crawl ${item.identifier}: ${e.message}`);
    }
  }

  return { probed, ingested, crawled, skipped, errors };
}

async function fetchSourceItems(
  type: SourceType,
  config: Record<string, any>,
  sourceId: string
): Promise<DiscoveryItem[]> {
  switch (type) {
    case "npm_registry":
      return fetchNpmPackages(config);
    case "pypi":
      return fetchPyPIPackages(config);
    case "cratesio":
      return fetchCratesPackages(config);
    case "github_search":
      return fetchGitHubRepos(config);
    case "rss":
      return fetchRSSFeed({
        feedUrl: config.feedUrl as string,
        sourceId,
      });
    case "custom_url":
      // Custom URL sources just queue a single item
      if (config.url) {
        return [
          {
            identifier: config.identifier ?? config.url,
            name: config.name ?? config.url,
            websiteUrl: config.url,
            docsUrl: config.docsUrl,
          },
        ];
      }
      return [];
    default:
      throw new Error(`Unknown source type: ${type}`);
  }
}

function deriveLibraryId(sourceId: string, identifier: string): string {
  if (sourceId.startsWith("npm")) return `npm:${identifier}`;
  if (sourceId.startsWith("pypi")) return `pypi:${identifier}`;
  if (sourceId.startsWith("cratesio")) return `crate:${identifier}`;
  if (sourceId.startsWith("github")) return `gh:${identifier}`;
  if (sourceId.startsWith("rss")) return `rss:${identifier}`;
  // Fallback: slugify the identifier
  return identifier
    .toLowerCase()
    .replace(/[^a-z0-9:/-]+/g, "-")
    .replace(/^-|-$/g, "");
}

function deriveCategory(
  sourceId: string,
  metadataStr: string | null
): string | null {
  let metadata: Record<string, any> = {};
  try {
    metadata = JSON.parse(metadataStr || "{}");
  } catch {}

  // GitHub repos with >10k stars get "framework" category
  if (sourceId.startsWith("github") && metadata.stars > 10_000) {
    return "framework";
  }

  // Default all discovery items to "library"
  return "library";
}
