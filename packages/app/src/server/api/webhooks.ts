import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq } from "drizzle-orm";

// POST /api/webhooks/github — receives push events from connected repos
export async function handleGitHubWebhook(request: Request): Promise<Response> {
  const event = request.headers.get("X-GitHub-Event");
  if (event !== "push") {
    return Response.json({ ignored: true, reason: `Event type: ${event}` });
  }

  const body = (await request.json()) as {
    ref?: string;
    repository?: {
      full_name?: string;
      default_branch?: string;
    };
  };

  // Only process pushes to the default branch
  const defaultBranch = body.repository?.default_branch ?? "main";
  const expectedRef = `refs/heads/${defaultBranch}`;
  if (body.ref !== expectedRef) {
    return Response.json({
      ignored: true,
      reason: `Push to non-default branch: ${body.ref}`,
    });
  }

  const repoFullName = body.repository?.full_name;
  if (!repoFullName) {
    return Response.json({ error: "Missing repository info" }, { status: 400 });
  }

  const [repoOwner, repoName] = repoFullName.split("/");

  const db = createDb(env.DB);

  // Find the connection for this repo
  const connections = await db
    .select()
    .from(schema.repoConnections)
    .where(eq(schema.repoConnections.repoOwner, repoOwner));

  const connection = connections.find((c) => c.repoName === repoName);
  if (!connection || !connection.verifiedAt) {
    return Response.json({ ignored: true, reason: "No verified connection" });
  }

  // Verify webhook signature
  const signature = request.headers.get("X-Hub-Signature-256");
  if (connection.webhookSecret && signature) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(connection.webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const rawBody = JSON.stringify(body);
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const expectedSig =
      "sha256=" +
      Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    if (signature !== expectedSig) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // Trigger re-ingest for the connected library
  const libraryId = connection.libraryId;
  const results: string[] = [];

  try {
    // Re-ingest from repo using internal fetch
    const baseUrl = (env as any).BASE_URL;
    const ingestRes = await fetch(
      `${baseUrl}/api/libraries/${encodeURIComponent(libraryId)}/repo/ingest`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );
    results.push(`ingest: ${ingestRes.status}`);
  } catch (e: any) {
    results.push(`ingest_error: ${e.message}`);
  }

  // Check if library has a live doc site → trigger rebuild
  const [docSite] = await db
    .select()
    .from(schema.docSites)
    .where(eq(schema.docSites.libraryId, libraryId))
    .limit(1);

  if (docSite && docSite.status === "live") {
    try {
      const { generateAndUploadDocs } = await import("../lib/docs-generator");
      await generateAndUploadDocs(libraryId, docSite.subdomain);

      await db
        .update(schema.docSites)
        .set({ lastBuiltAt: new Date().toISOString() })
        .where(eq(schema.docSites.id, docSite.id));

      results.push("docs_rebuilt: true");
    } catch (e: any) {
      results.push(`docs_rebuild_error: ${e.message}`);
    }
  }

  return Response.json({
    processed: true,
    libraryId,
    repo: repoFullName,
    results,
  });
}
