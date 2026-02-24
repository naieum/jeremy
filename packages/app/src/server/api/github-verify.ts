import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq } from "drizzle-orm";

// GET /api/github/verify/callback — OAuth callback for repo verification
export async function handleGitHubVerifyCallback(
  request: Request
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // connection ID

  if (!code || !state) {
    return new Response("Missing code or state parameter", { status: 400 });
  }

  const clientId = (env as any).GITHUB_CLIENT_ID;
  const clientSecret = (env as any).GITHUB_CLIENT_SECRET;
  const baseUrl = (env as any).BASE_URL;

  if (!clientId || !clientSecret) {
    return new Response("GitHub OAuth not configured", { status: 500 });
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!tokenRes.ok) {
    return new Response("Failed to exchange OAuth code", { status: 500 });
  }

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };

  if (!tokenData.access_token) {
    return new Response(`OAuth error: ${tokenData.error ?? "unknown"}`, {
      status: 400,
    });
  }

  const accessToken = tokenData.access_token;

  // Look up the connection
  const db = createDb(env.DB);
  const [connection] = await db
    .select()
    .from(schema.repoConnections)
    .where(eq(schema.repoConnections.id, state))
    .limit(1);

  if (!connection) {
    return new Response("Connection not found", { status: 404 });
  }

  // Check repo access with the user's token
  const repoRes = await fetch(
    `https://api.github.com/repos/${connection.repoOwner}/${connection.repoName}`,
    {
      headers: {
        "User-Agent": "Jeremy-App",
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!repoRes.ok) {
    return redirectWithMessage(
      baseUrl,
      connection.libraryId,
      "error",
      "Could not access the repository with your GitHub account"
    );
  }

  const repoData = (await repoRes.json()) as {
    permissions?: { push?: boolean };
  };

  if (!repoData.permissions?.push) {
    return redirectWithMessage(
      baseUrl,
      connection.libraryId,
      "error",
      "Your GitHub account does not have write access to this repository"
    );
  }

  // Get GitHub user ID
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      "User-Agent": "Jeremy-App",
      Authorization: `token ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  let githubUserId: string | null = null;
  if (userRes.ok) {
    const userData = (await userRes.json()) as { id?: number };
    githubUserId = userData.id ? String(userData.id) : null;
  }

  // Update connection as verified
  await db
    .update(schema.repoConnections)
    .set({
      verifiedAt: new Date().toISOString(),
      verificationMethod: "oauth",
      githubUserId,
    })
    .where(eq(schema.repoConnections.id, connection.id));

  return redirectWithMessage(
    baseUrl,
    connection.libraryId,
    "success",
    "Repository verified successfully via GitHub OAuth"
  );
}

function redirectWithMessage(
  baseUrl: string,
  libraryId: string,
  status: "success" | "error",
  message: string
): Response {
  const redirectUrl = `${baseUrl}/dashboard/libraries/${encodeURIComponent(libraryId)}?verify=${status}&message=${encodeURIComponent(message)}`;
  return new Response(null, {
    status: 302,
    headers: { Location: redirectUrl },
  });
}
