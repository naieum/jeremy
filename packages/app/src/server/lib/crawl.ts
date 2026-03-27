import { env } from "cloudflare:workers";
import puppeteer from "@cloudflare/puppeteer";
import { createDb, schema } from "../db";
import { eq } from "drizzle-orm";
import { generateEmbeddings } from "./embeddings";
import { upsertVectors, deleteVectorsByLibrary } from "./vectorize";
import { invalidateLibrary } from "./cache";
import { isValidFetchUrl } from "./url-validation";

export interface CrawlParams {
  libraryId: string;
  name: string;
  description?: string;
  urls: string[];
  replace: boolean;
  ownerId: string;
  maxPages?: number;
}

export interface CrawlResult {
  pagesDiscovered: number;
  pagesCrawled: number;
  chunksIngested: number;
  vectorized: boolean;
  errors: string[];
}

export interface CrawlChunk {
  id: string;
  title?: string;
  content: string;
  url?: string;
  tokenCount?: number;
}

export function chunkText(text: string, maxTokens = 500, overlap = 50): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxTokens, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;
    start = end - overlap;
  }
  return chunks;
}

/**
 * Extract main content text from a rendered page, stripping nav/footer/etc.
 */
export async function extractPageContent(page: any): Promise<{ title: string; content: string }> {
  const result = await Promise.race([
    page.evaluate(() => {
    const removeSelectors = [
      "nav", "footer", "header", ".nav", ".navbar", ".sidebar",
      ".footer", ".header", "[role='navigation']", "[role='banner']",
      "[role='contentinfo']", "script", "style", "noscript",
      ".table-of-contents", ".toc", "#toc", ".breadcrumb",
      ".edit-page", ".page-nav", ".prev-next",
    ];
    for (const sel of removeSelectors) {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    }

    const mainSelectors = [
      "main", "article", "[role='main']",
      ".docs-content", ".markdown-body", ".prose",
      ".content", "#content", ".doc-content",
    ];
    let mainEl: Element | null = null;
    for (const sel of mainSelectors) {
      mainEl = document.querySelector(sel);
      if (mainEl) break;
    }
    if (!mainEl) mainEl = document.body;

    const title = document.title || "";
    const content = (mainEl as HTMLElement).innerText || "";
    return { title, content };
  }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("page.evaluate timed out")), 10000)
    ),
  ]);
  return result;
}

/**
 * Discover all documentation links from a rendered page.
 */
export async function discoverDocLinks(page: any, baseUrl: string): Promise<string[]> {
  const links: string[] = await page.evaluate((base: string) => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const baseOrigin = new URL(base).origin;
    return anchors
      .map((a) => {
        try {
          return new URL((a as HTMLAnchorElement).href, base).toString();
        } catch {
          return null;
        }
      })
      .filter((href): href is string => {
        if (!href) return false;
        if (!href.startsWith(baseOrigin)) return false;
        if (href.includes("#")) return false;
        if (/\.(png|jpg|svg|css|js|ico|woff|ttf)(\?|$)/i.test(href)) return false;
        return true;
      });
  }, baseUrl);

  return [...new Set(links)];
}

/**
 * Crawl pages using Browser Rendering, chunk content, store in D1,
 * generate embeddings, and upsert vectors.
 */
export async function crawlAndIngest(params: CrawlParams): Promise<CrawlResult> {
  const {
    libraryId, name, description, urls,
    replace, ownerId, maxPages = 150,
  } = params;

  const allChunks: CrawlChunk[] = [];
  let chunkIdx = 0;
  const crawled: string[] = [];
  const errors: string[] = [];

  // Launch browser with try/finally to prevent resource leaks
  let pagesToCrawl = urls;
  const browser = await puppeteer.launch(env.BROWSER as any);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // If a single URL, discover links first and extract content from seed page
    if (urls.length === 1) {
      try {
        await page.goto(urls[0], { waitUntil: "networkidle2", timeout: 15000 });
        const discovered = await discoverDocLinks(page, urls[0]);

        // Extract content from the seed page while we're here
        const { title, content } = await extractPageContent(page);
        if (content.trim().length >= 50) {
          const textChunks = chunkText(content, 500, 50);
          for (const tc of textChunks) {
            allChunks.push({
              id: `${libraryId}:${chunkIdx++}`,
              title: title || undefined,
              content: tc.slice(0, 4000),
              url: urls[0],
              tokenCount: Math.ceil(tc.split(/\s+/).length * 1.3),
            });
          }
          crawled.push(urls[0]);
        }

        if (discovered.length > 1) {
          // Remove the seed URL since we already crawled it
          // Validate discovered URLs to prevent SSRF via crafted links
          pagesToCrawl = discovered
            .filter((u) => u !== urls[0] && isValidFetchUrl(u))
            .slice(0, maxPages - 1);
        } else {
          pagesToCrawl = [];
        }
      } catch (e: any) {
        errors.push(`Discovery failed: ${e.message}`);
      }
    }

    // Crawl each discovered page
    for (const url of pagesToCrawl) {
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 10000 });
        const { title, content } = await extractPageContent(page);

        if (content.trim().length < 50) continue;

        const textChunks = chunkText(content, 500, 50);
        for (const tc of textChunks) {
          allChunks.push({
            id: `${libraryId}:${chunkIdx++}`,
            title: title || undefined,
            content: tc.slice(0, 4000),
            url,
            tokenCount: Math.ceil(tc.split(/\s+/).length * 1.3),
          });
        }
        crawled.push(url);
      } catch (e: any) {
        errors.push(`${url}: ${e.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (allChunks.length === 0) {
    throw new Error(`No content extracted. Errors: ${errors.join("; ")}`);
  }

  // Store in D1
  const db = createDb(env.DB);
  const [existing] = await db
    .select()
    .from(schema.libraries)
    .where(eq(schema.libraries.id, libraryId))
    .limit(1);

  if (existing && existing.ownerId !== ownerId) {
    throw new Error("You do not own this library");
  }

  if (replace && existing) {
    await db.delete(schema.chunks).where(eq(schema.chunks.libraryId, libraryId));
    try { await deleteVectorsByLibrary(libraryId); } catch {}
  }

  const sourceUrl = urls[0];

  if (existing) {
    await db.update(schema.libraries).set({
      name, description, sourceType: "crawl",
      sourceUrl,
      chunkCount: allChunks.length,
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.libraries.id, libraryId));
  } else {
    await db.insert(schema.libraries).values({
      id: libraryId, name, description,
      sourceType: "crawl",
      sourceUrl,
      chunkCount: allChunks.length,
      ownerId,
    });
  }

  // Insert chunks in batches (D1 limit: ~100 SQL vars)
  for (let i = 0; i < allChunks.length; i += 10) {
    const batch = allChunks.slice(i, i + 10);
    await db.insert(schema.chunks).values(
      batch.map((c) => ({
        id: c.id,
        libraryId,
        title: c.title ?? null,
        content: c.content,
        url: c.url ?? null,
        tokenCount: c.tokenCount ?? null,
      }))
    );
  }

  // Generate embeddings and upsert vectors (skip if too many chunks)
  let vectorized = false;
  if (allChunks.length <= 500) {
    try {
      const texts = allChunks.map(
        (c) => `${c.title ? c.title + ": " : ""}${c.content}`.slice(0, 2000)
      );
      const embeddings = await generateEmbeddings(texts);
      const vectors = allChunks.map((c, j) => ({
        id: c.id,
        values: embeddings[j],
        metadata: { chunkId: c.id, libraryId, title: c.title },
      }));
      await upsertVectors(vectors);
      vectorized = true;
    } catch (e: any) {
      console.warn("Embedding failed:", e.message);
    }
  }

  // R2 backup
  try {
    await env.DOCS_BUCKET.put(`${libraryId}/chunks.json`, JSON.stringify(allChunks));
  } catch {}

  // Invalidate cache
  await invalidateLibrary(libraryId);

  return {
    pagesDiscovered: pagesToCrawl.length + (urls.length === 1 ? 1 : 0),
    pagesCrawled: crawled.length,
    chunksIngested: allChunks.length,
    vectorized,
    errors,
  };
}
