import { env } from "cloudflare:workers";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  limit: number = 60
): Promise<RateLimitResult> {
  const minute = Math.floor(Date.now() / 60000);
  const key = `rl:${identifier}:${endpoint}:${minute}`;

  try {
    const current = await env.CACHE.get(key, "text");
    const count = current ? parseInt(current, 10) : 0;

    if (count >= limit) {
      return { allowed: false, remaining: 0, retryAfter: 60 - (Math.floor(Date.now() / 1000) % 60) };
    }

    await env.CACHE.put(key, String(count + 1), { expirationTtl: 120 });
    return { allowed: true, remaining: limit - count - 1 };
  } catch (e) {
    // If KV fails, deny the request (fail closed) to prevent abuse during outages
    console.warn("Rate limit KV failed, denying request:", e);
    return { allowed: false, remaining: 0, retryAfter: 10 };
  }
}

export function rateLimitResponse(retryAfter: number): Response {
  return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
    },
  });
}
