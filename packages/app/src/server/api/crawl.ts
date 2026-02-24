import { env } from "cloudflare:workers";
import puppeteer from "@cloudflare/puppeteer";
import { createDb, schema } from "../db";
import { eq } from "drizzle-orm";
import { validateApiKey } from "../middleware/api-auth";
import { createAuth } from "../auth";
import { generateEmbeddings } from "../lib/embeddings";
import { upsertVectors } from "../lib/vectorize";
import { invalidateLibrary } from "../lib/cache";
import { isValidFetchUrl } from "../lib/url-validation";
import { checkRateLimit, rateLimitResponse } from "../middleware/rate-limit";

interface CrawlBody {
  libraryId: string;
  name: string;
  description?: string;
  urls: string[];
  replace?: boolean;
}

async function getSessionUserId(request: Request): Promise<string | null> {
  try {
    const origin = new URL(request.url).origin;
    const auth = createAuth(env as any, origin);
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function chunkText(text: string, maxTokens = 500, overlap = 50): string[] {
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
async function extractPageContent(page: any): Promise<{ title: string; content: string }> {
  return await page.evaluate(() => {
    // Remove noise elements
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

    // Try to find the main content area
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
  });
}

/**
 * Discover all documentation links from a page.
 */
async function discoverDocLinks(page: any, baseUrl: string): Promise<string[]> {
  const links: string[] = await page.evaluate((base: string) => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const baseOrigin = new URL(base).origin;
    const basePath = new URL(base).pathname;
    return anchors
      .map((a) => {
        try {
          const href = new URL((a as HTMLAnchorElement).href, base).toString();
          return href;
        } catch {
          return null;
        }
      })
      .filter((href): href is string => {
        if (!href) return false;
        if (!href.startsWith(baseOrigin)) return false;
        // Filter out anchors, assets, etc
        if (href.includes("#")) return false;
        if (/\.(png|jpg|svg|css|js|ico|woff|ttf)(\?|$)/i.test(href)) return false;
        return true;
      });
  }, baseUrl);

  // Deduplicate
  return [...new Set(links)];
}

export async function handleCrawl(request: Request): Promise<Response> {
  try {
    const apiAuth = await validateApiKey(request, "admin");
    const sessionUserId = apiAuth ? null : await getSessionUserId(request);
    const userId = apiAuth?.userId ?? sessionUserId;

    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(apiAuth?.keyId ?? userId, "write", 10);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.retryAfter!);
    }

    const body: CrawlBody = await request.json();
    const { libraryId, name, description, urls, replace } = body;

    if (!libraryId || !name || !urls?.length) {
      return Response.json({ error: "libraryId, name, and urls are required" }, { status: 400 });
    }

    // Validate all URLs before crawling (SSRF prevention)
    const invalidUrls = urls.filter((u: string) => !isValidFetchUrl(u));
    if (invalidUrls.length > 0) {
      return Response.json(
        { error: "Invalid URLs: must be public HTTP/HTTPS URLs (private IPs and metadata services are blocked)" },
        { status: 400 }
      );
    }

    // Launch browser
    const browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const allChunks: {
      id: string;
      title?: string;
      content: string;
      url?: string;
      tokenCount?: number;
    }[] = [];
    let chunkIdx = 0;
    const crawled: string[] = [];
    const errors: string[] = [];

    // If a single URL is given, discover links first
    let pagesToCrawl = urls;
    if (urls.length === 1) {
      try {
        await page.goto(urls[0], { waitUntil: "networkidle0", timeout: 15000 });
        const discovered = await discoverDocLinks(page, urls[0]);
        if (discovered.length > 1) {
          // Limit to 150 pages max
          pagesToCrawl = discovered.slice(0, 150);
        }
      } catch (e: any) {
        console.warn("Discovery failed:", e.message);
      }
    }

    // Crawl each page
    for (const url of pagesToCrawl) {
      try {
        await page.goto(url, { waitUntil: "networkidle0", timeout: 10000 });
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

    await browser.close();

    if (allChunks.length === 0) {
      return Response.json({ error: "No content extracted", errors }, { status: 400 });
    }

    // Ingest chunks into D1
    const db = createDb(env.DB);

    // Upsert library
    const [existing] = await db
      .select()
      .from(schema.libraries)
      .where(eq(schema.libraries.id, libraryId))
      .limit(1);

    if (existing && existing.ownerId !== userId) {
      return Response.json({ error: "You do not own this library" }, { status: 403 });
    }

    if (replace && existing) {
      await db.delete(schema.chunks).where(eq(schema.chunks.libraryId, libraryId));
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
        ownerId: userId,
      });
    }

    // Insert chunks in batches
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

    // Generate embeddings if not too many chunks
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

    // Invalidate cached context results for this library
    await invalidateLibrary(libraryId);

    return Response.json({
      success: true,
      libraryId,
      pagesDiscovered: pagesToCrawl.length,
      pagesCrawled: crawled.length,
      chunksIngested: allChunks.length,
      vectorized,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("Crawl error:", e?.message, e?.stack);
    return Response.json({ error: `Crawl failed: ${e?.message}` }, { status: 500 });
  }
}
