import { env } from "cloudflare:workers";
import { createDb, schema } from "../db";
import { eq } from "drizzle-orm";

interface GeneratedFile {
  path: string;
  content: string;
}

interface ChunkGroup {
  path: string;
  title: string;
  chunks: Array<{ title: string | null; content: string; url: string | null }>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractPathFromUrl(url: string): string[] {
  try {
    const parsed = new URL(url);
    return parsed.pathname
      .split("/")
      .filter(Boolean)
      .map((seg) => slugify(seg));
  } catch {
    return [];
  }
}

export function generateDocsContent(
  chunks: Array<{
    id: string;
    title: string | null;
    content: string;
    url: string | null;
  }>
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Group chunks by source URL path
  const groups = new Map<string, ChunkGroup>();

  for (const chunk of chunks) {
    let groupKey: string;
    let groupPath: string;
    let groupTitle: string;

    if (chunk.url) {
      const pathSegments = extractPathFromUrl(chunk.url);
      groupKey = pathSegments.join("/") || "index";
      groupPath = groupKey;
      groupTitle = chunk.title ?? pathSegments[pathSegments.length - 1] ?? "Documentation";
    } else {
      const slug = chunk.title ? slugify(chunk.title) : chunk.id;
      groupKey = slug;
      groupPath = slug;
      groupTitle = chunk.title ?? "Documentation";
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        path: groupPath,
        title: groupTitle,
        chunks: [],
      });
    }
    groups.get(groupKey)!.chunks.push({
      title: chunk.title,
      content: chunk.content,
      url: chunk.url,
    });
  }

  // Generate MDX files for each group
  for (const [, group] of groups) {
    const frontmatter = [
      "---",
      `title: "${group.title.replace(/"/g, '\\"')}"`,
      "---",
      "",
    ].join("\n");

    const body = group.chunks
      .map((c) => c.content)
      .join("\n\n");

    files.push({
      path: `content/docs/${group.path}.mdx`,
      content: frontmatter + body,
    });
  }

  // Generate meta.json files for directory hierarchy
  const directories = new Map<string, Set<string>>();

  for (const file of files) {
    const parts = file.path.replace("content/docs/", "").replace(".mdx", "").split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join("/");
      if (!directories.has(dir)) {
        directories.set(dir, new Set());
      }
      directories.get(dir)!.add(parts[parts.length - 1]);
    }
  }

  // Root level meta
  const rootPages = new Set<string>();
  for (const file of files) {
    const rel = file.path.replace("content/docs/", "").replace(".mdx", "");
    const firstPart = rel.split("/")[0];
    rootPages.add(firstPart);
  }

  if (rootPages.size > 0) {
    files.push({
      path: "content/docs/meta.json",
      content: JSON.stringify({
        title: "Documentation",
        pages: [...rootPages].sort(),
      }, null, 2),
    });
  }

  for (const [dir, pages] of directories) {
    const dirTitle = dir.split("/").pop() ?? dir;
    files.push({
      path: `content/docs/${dir}/meta.json`,
      content: JSON.stringify({
        title: dirTitle.charAt(0).toUpperCase() + dirTitle.slice(1),
        pages: [...pages].sort(),
      }, null, 2),
    });
  }

  return files;
}

export async function generateAndUploadDocs(
  libraryId: string,
  subdomain: string
): Promise<void> {
  const db = createDb(env.DB);

  // Fetch all chunks for the library
  const allChunks = await db
    .select({
      id: schema.chunks.id,
      title: schema.chunks.title,
      content: schema.chunks.content,
      url: schema.chunks.url,
    })
    .from(schema.chunks)
    .where(eq(schema.chunks.libraryId, libraryId));

  if (allChunks.length === 0) {
    throw new Error("No chunks found for this library");
  }

  const files = generateDocsContent(allChunks);

  // Upload generated files to R2
  for (const file of files) {
    const r2Key = `docs/${subdomain}/${file.path}`;
    await env.DOCS_BUCKET.put(r2Key, file.content, {
      httpMetadata: {
        contentType: file.path.endsWith(".json")
          ? "application/json"
          : "text/markdown",
      },
    });
  }

  // Also generate a simple index.html that redirects to docs
  const indexHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=/docs">
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting to <a href="/docs">documentation</a>...</p>
</body>
</html>`;

  await env.DOCS_BUCKET.put(`docs/${subdomain}/index.html`, indexHtml, {
    httpMetadata: { contentType: "text/html" },
  });
}
