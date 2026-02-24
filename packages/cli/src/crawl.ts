export interface CrawlResult {
  title: string;
  content: string;
  url: string;
}

/**
 * Strip HTML tags and decode common HTML entities from a string.
 */
function stripHtml(html: string): string {
  // Remove <script> and <style> blocks entirely, including their content.
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Replace block-level elements with newlines to preserve structure.
  text = text.replace(/<\/?(p|div|h[1-6]|li|tr|blockquote|pre|br)[^>]*>/gi, "\n");

  // Strip all remaining tags.
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities.
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 10)),
    );

  // Collapse excessive whitespace while preserving paragraph breaks.
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

/**
 * Extract the page title from an HTML string.
 */
function extractTitle(html: string, fallbackUrl: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  // Fall back to the last path segment of the URL.
  try {
    const parsed = new URL(fallbackUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1];
    }
    return parsed.hostname;
  } catch {
    return fallbackUrl;
  }
}

/**
 * Fetch a single URL, strip its HTML, and return the plain-text content.
 * Does NOT follow any links found on the page.
 */
export async function crawlUrl(url: string): Promise<CrawlResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        // Identify ourselves and request plain text where possible.
        "User-Agent": "jeremy-cli/1.0",
        Accept: "text/html,text/plain,*/*",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error fetching ${url}: ${message}`);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const rawBody = await response.text();

  let content: string;
  let title: string;

  if (contentType.includes("text/html")) {
    title = extractTitle(rawBody, url);
    content = stripHtml(rawBody);
  } else {
    // Plain text, markdown, etc. — use as-is.
    title = (() => {
      try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split("/").filter(Boolean);
        return segments.length > 0 ? segments[segments.length - 1] : parsed.hostname;
      } catch {
        return url;
      }
    })();
    content = rawBody.trim();
  }

  return { title, content, url };
}
