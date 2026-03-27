import { isValidFetchUrl } from "./url-validation";

export type DiscoveryResult =
  | { strategy: "llms_txt"; url: string }
  | { strategy: "crawl"; url: string }
  | { strategy: "skip"; reason: string };

/**
 * Probe a website to discover the best docs URL.
 * Uses only fetch() with HEAD→GET fallback, no browser rendering.
 */
export async function discoverDocUrl(
  websiteUrl: string,
  knownDocsUrl?: string
): Promise<DiscoveryResult> {
  if (knownDocsUrl) {
    // If we already have a known docs URL, check for llms.txt there first
    const llmsTxt = await probeUrl(withTrailingSlash(knownDocsUrl) + "llms.txt");
    if (llmsTxt) return { strategy: "llms_txt", url: llmsTxt };

    const docsPage = await probeUrl(knownDocsUrl);
    if (docsPage) return { strategy: "crawl", url: docsPage };
  }

  let origin: string;
  let baseDomain: string;
  try {
    const parsed = new URL(websiteUrl);
    origin = parsed.origin;
    baseDomain = parsed.hostname.replace(/^www\./, "");
  } catch {
    return { strategy: "skip", reason: "Invalid URL" };
  }

  // Probe sequence for llms.txt
  const llmsProbes = [
    `${origin}/llms.txt`,
    `${origin}/docs/llms.txt`,
    `https://docs.${baseDomain}/llms.txt`,
  ];

  for (const probe of llmsProbes) {
    const result = await probeUrl(probe, origin);
    if (result) return { strategy: "llms_txt", url: result };
  }

  // Probe for crawlable docs pages
  const crawlProbes = [
    `${origin}/docs`,
    `https://docs.${baseDomain}/`,
  ];

  for (const probe of crawlProbes) {
    const result = await probeUrl(probe, origin);
    if (result) return { strategy: "crawl", url: result };
  }

  return { strategy: "skip", reason: "No docs URL found" };
}

function withTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : url + "/";
}

/**
 * Probe a URL with HEAD first, fallback to GET.
 * Returns the final URL after redirects, or null if not reachable.
 * If expectedOrigin is provided, verifies the final URL stays on the same domain.
 */
async function probeUrl(
  url: string,
  expectedOrigin?: string
): Promise<string | null> {
  if (!isValidFetchUrl(url)) return null;

  try {
    // Try HEAD first (cheaper)
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
    });

    // Some servers don't support HEAD, fallback to GET
    if (res.status === 405 || res.status === 404) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(5_000),
      });
    }

    if (!res.ok) return null;

    const finalUrl = res.url || url;

    // Verify the redirect didn't take us to a completely different domain
    if (expectedOrigin) {
      try {
        const finalOrigin = new URL(finalUrl).origin;
        const expectedDomain = new URL(expectedOrigin).hostname.replace(
          /^www\./,
          ""
        );
        const finalDomain = new URL(finalUrl).hostname.replace(/^www\./, "");

        // Allow subdomains of the expected domain (e.g., docs.react.dev for react.dev)
        if (
          !finalDomain.endsWith(expectedDomain) &&
          !expectedDomain.endsWith(finalDomain)
        ) {
          return null; // Redirected to a different domain
        }
      } catch {
        return null;
      }
    }

    return finalUrl;
  } catch {
    return null;
  }
}
