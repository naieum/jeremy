import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import { extractLibraryInfo } from "~/server/lib/ai";
import { ingestFromUrl } from "~/server/api/ingest-url";

function getAdminUserId(): string {
  return (env as any).ADMIN_USER_ID;
}

async function getSession(request: Request) {
  const origin = new URL(request.url).origin;
  const auth = createAuth(env as any, origin);
  return auth.api.getSession({ headers: request.headers });
}

export async function handleChat(request: Request): Promise<Response> {
  // Auth check
  const session = await getSession(request);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check
  const adminUserId = getAdminUserId();
  if (session.user.id !== adminUserId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as { message: string };
  if (!body.message?.trim()) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  // Extract library info via AI
  let aiResult;
  try {
    aiResult = await extractLibraryInfo(body.message);
  } catch (e: any) {
    return Response.json({
      role: "assistant",
      content: "Sorry, I had trouble processing that. Could you try again?",
    });
  }

  // If AI needs clarification, return it as a message
  if (aiResult.type === "clarification") {
    return Response.json({
      role: "assistant",
      content: aiResult.message,
    });
  }

  // We have a valid library spec — ingest it
  const spec = aiResult.data;
  try {
    const result = await ingestFromUrl({
      libraryId: spec.id,
      name: spec.name,
      description: spec.description,
      sourceUrl: spec.sourceUrl,
      sourceType: spec.sourceType,
      ownerId: session.user.id,
    });

    return Response.json({
      role: "assistant",
      content: `Added **${spec.name}** (${result.chunksIngested} chunks)`,
      library: {
        id: spec.id,
        name: spec.name,
        chunksIngested: result.chunksIngested,
        vectorized: result.vectorized,
      },
    });
  } catch (e: any) {
    console.error("Chat ingest error:", e);
    return Response.json({
      role: "assistant",
      content: `Failed to ingest **${spec.name}**. Please check the URL is accessible and try again.`,
    });
  }
}
