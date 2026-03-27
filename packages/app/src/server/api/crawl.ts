import { env } from "cloudflare:workers";
import { validateApiKey } from "../middleware/api-auth";
import { createAuth } from "../auth";
import { isValidFetchUrl } from "../lib/url-validation";
import { checkRateLimit, rateLimitResponse } from "../middleware/rate-limit";
import { crawlAndIngest } from "../lib/crawl";

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

    // Validate all URLs (SSRF prevention)
    const invalidUrls = urls.filter((u: string) => !isValidFetchUrl(u));
    if (invalidUrls.length > 0) {
      return Response.json(
        { error: "Invalid URLs: must be public HTTP/HTTPS URLs (private IPs and metadata services are blocked)" },
        { status: 400 }
      );
    }

    const result = await crawlAndIngest({
      libraryId,
      name,
      description,
      urls,
      replace: replace ?? false,
      ownerId: userId,
      maxPages: 150,
    });

    return Response.json({
      success: true,
      libraryId,
      ...result,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (e: any) {
    console.error("Crawl error:", e?.message, e?.stack);
    return Response.json({ error: `Crawl failed: ${e?.message}` }, { status: 500 });
  }
}
