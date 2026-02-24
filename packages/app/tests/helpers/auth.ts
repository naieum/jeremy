import type { APIRequestContext } from "@playwright/test";

interface Credentials {
  email: string;
  password: string;
  name: string;
}

interface AuthResult {
  cookies: string;
  userId?: string;
  sessionToken?: string;
}

export async function signUp(
  request: APIRequestContext,
  creds: Credentials
): Promise<AuthResult> {
  const res = await request.post("/api/auth/sign-up/email", {
    data: {
      email: creds.email,
      password: creds.password,
      name: creds.name,
    },
  });

  const cookies = (res.headers()["set-cookie"] ?? "");
  const body = await res.json().catch(() => ({}));

  return {
    cookies,
    userId: body?.user?.id ?? body?.id,
    sessionToken: body?.token,
  };
}

export async function signIn(
  request: APIRequestContext,
  creds: { email: string; password: string }
): Promise<AuthResult> {
  const res = await request.post("/api/auth/sign-in/email", {
    data: {
      email: creds.email,
      password: creds.password,
    },
  });

  const cookies = (res.headers()["set-cookie"] ?? "");
  const body = await res.json().catch(() => ({}));

  return {
    cookies,
    userId: body?.user?.id ?? body?.id,
    sessionToken: body?.token,
  };
}

export async function getSession(
  request: APIRequestContext
): Promise<{ user: { id: string; name: string; email: string } } | null> {
  const res = await request.get("/api/auth/get-session");
  if (!res.ok()) return null;
  const body = await res.json().catch(() => null);
  return body;
}

/**
 * Extract the cookie header string from a set-cookie response.
 * Better Auth returns cookies that we need to forward on subsequent requests.
 */
export function extractCookieHeader(setCookieHeader: string): string {
  if (!setCookieHeader) return "";
  // set-cookie may have multiple cookies separated by comma+space but
  // each cookie's attributes are separated by semicolons.
  // We need just the name=value pairs.
  return setCookieHeader
    .split(/,(?=\s*\w+=)/)
    .map((c) => c.split(";")[0].trim())
    .join("; ");
}
