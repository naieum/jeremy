export interface Env {
  DOCS_BUCKET: R2Bucket;
  DB: D1Database;
}

const CACHE_HTML = 3600; // 1 hour
const CACHE_ASSETS = 31536000; // 1 year

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
  ".xml": "text/xml",
  ".mdx": "text/markdown",
  ".md": "text/markdown",
};

function getContentType(path: string): string {
  const ext = path.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

function isHashedAsset(path: string): boolean {
  return /_next\/static\//.test(path) || /\.[a-f0-9]{8,}\.(js|css|woff2?)$/.test(path);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Extract subdomain from *.docs.jeremy.dev
    const subdomainMatch = hostname.match(/^([^.]+)\.docs\.jeremy\.dev$/);
    if (!subdomainMatch) {
      return new Response("Not Found", { status: 404 });
    }

    const subdomain = subdomainMatch[1];

    // Verify the site exists and is live
    try {
      const stmt = env.DB.prepare(
        "SELECT id, status FROM doc_sites WHERE subdomain = ? LIMIT 1"
      );
      const site = await stmt.bind(subdomain).first<{
        id: string;
        status: string;
      }>();

      if (!site) {
        return notFoundPage(subdomain);
      }

      if (site.status !== "live") {
        return new Response(
          `<html><body style="font-family:monospace;text-align:center;padding:4rem;">
            <h1>Site is ${site.status}</h1>
            <p>The documentation for <strong>${subdomain}</strong> is currently being built.</p>
          </body></html>`,
          {
            status: 503,
            headers: { "Content-Type": "text/html" },
          }
        );
      }
    } catch {
      // If DB check fails, try to serve anyway
    }

    // Resolve path
    let path = url.pathname;
    if (path === "/") path = "/index.html";
    if (!path.includes(".")) path = `${path.replace(/\/$/, "")}/index.html`;

    // Serve from R2
    const r2Key = `docs/${subdomain}${path}`;
    const object = await env.DOCS_BUCKET.get(r2Key);

    if (!object) {
      // Try without trailing index.html
      const altKey = `docs/${subdomain}${url.pathname.replace(/\/$/, "")}.html`;
      const altObject = await env.DOCS_BUCKET.get(altKey);
      if (altObject) {
        return buildResponse(altObject, altKey);
      }
      return notFoundPage(subdomain);
    }

    return buildResponse(object, r2Key);

    function buildResponse(obj: R2ObjectBody, key: string): Response {
      const contentType = getContentType(key);
      const cacheControl = isHashedAsset(key)
        ? `public, max-age=${CACHE_ASSETS}, immutable`
        : `public, max-age=${CACHE_HTML}`;

      return new Response(obj.body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": cacheControl,
          ETag: obj.httpEtag,
        },
      });
    }
  },
};

function notFoundPage(subdomain: string): Response {
  return new Response(
    `<html><body style="font-family:monospace;text-align:center;padding:4rem;">
      <h1>404</h1>
      <p>No documentation found for <strong>${subdomain}</strong>.</p>
      <a href="https://jeremy.dev">Jeremy</a>
    </body></html>`,
    {
      status: 404,
      headers: { "Content-Type": "text/html" },
    }
  );
}
