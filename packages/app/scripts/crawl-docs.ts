/**
 * Crawl documentation sites that don't have llms.txt files.
 * Fetches sitemap or index, crawls doc pages, extracts content, ingests.
 */

const API_URL = "https://jeremy-app.ian-muench.workers.dev";
const API_KEY = "jrmy_10eac3bb041a95da0cdc325e3f5e3bb5fcb9bfeb0a54e0d30f3b1d65cd11bfd5";
const MAX_CHUNKS_PER_REQUEST = 200;
const MAX_CONTENT_LENGTH = 4000;

interface DocSite {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
  // Either a sitemap URL or a function to discover doc URLs
  sitemapUrl?: string;
  // Or a list of known doc paths
  docPaths?: string[];
  // Or a GitHub repo to scrape markdown from
  github?: { owner: string; repo: string; paths: string[] };
}

const SITES: DocSite[] = [
  {
    id: "/radix-ui/primitives",
    name: "Radix UI",
    description: "Unstyled, accessible React UI primitives",
    docsUrl: "https://www.radix-ui.com",
    github: {
      owner: "radix-ui",
      repo: "website",
      paths: ["data/primitives/docs/components", "data/primitives/docs/overview", "data/primitives/docs/utilities"],
    },
  },
  {
    id: "/tailwindlabs/headlessui",
    name: "Headless UI",
    description: "Unstyled, accessible UI components for React and Vue",
    docsUrl: "https://headlessui.com",
    github: {
      owner: "tailwindlabs",
      repo: "headlessui",
      paths: ["packages/@headlessui-react/src", "packages/@headlessui-vue/src"],
    },
  },
  {
    id: "/react-hook-form/react-hook-form",
    name: "React Hook Form",
    description: "Performant, flexible forms with easy validation",
    docsUrl: "https://react-hook-form.com",
    github: {
      owner: "react-hook-form",
      repo: "documentation",
      paths: ["src/content/docs"],
    },
  },
  {
    id: "/pmndrs/zustand",
    name: "Zustand",
    description: "Small, fast, scalable state management for React",
    docsUrl: "https://zustand.docs.pmnd.rs",
    github: {
      owner: "pmndrs",
      repo: "zustand",
      paths: ["docs"],
    },
  },
  {
    id: "/storybookjs/storybook",
    name: "Storybook",
    description: "UI component development, testing, and documentation tool",
    docsUrl: "https://storybook.js.org",
    github: {
      owner: "storybookjs",
      repo: "storybook",
      paths: ["docs"],
    },
  },
];

// --- GitHub doc fetching ---

interface GHTreeItem {
  path: string;
  type: string;
  url: string;
}

async function fetchGitHubTree(owner: string, repo: string): Promise<GHTreeItem[]> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`, {
    headers: {
      "User-Agent": "JeremyBot/1.0",
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!res.ok) {
    // Try 'master' branch
    const res2 = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`, {
      headers: {
        "User-Agent": "JeremyBot/1.0",
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res2.ok) throw new Error(`GitHub API error: ${res2.status}`);
    const data = await res2.json() as any;
    return data.tree;
  }
  const data = await res.json() as any;
  return data.tree;
}

async function fetchRawFile(owner: string, repo: string, path: string, branch = "main"): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "JeremyBot/1.0" } });
    if (!res.ok) {
      // Try master
      const res2 = await fetch(url.replace("/main/", "/master/"), { headers: { "User-Agent": "JeremyBot/1.0" } });
      if (!res2.ok) return null;
      return await res2.text();
    }
    return await res.text();
  } catch {
    return null;
  }
}

function isDocFile(path: string): boolean {
  return /\.(md|mdx)$/i.test(path);
}

function extractTitle(content: string, filename: string): string {
  // Try frontmatter title
  const fmMatch = content.match(/^---[\s\S]*?title:\s*['"]?([^'"\n]+)['"]?/m);
  if (fmMatch) return fmMatch[1].trim();
  // Try first heading
  const headingMatch = content.match(/^#{1,3}\s+(.+)/m);
  if (headingMatch) return headingMatch[1].trim();
  // Use filename
  return filename.replace(/\.(md|mdx)$/, "").replace(/[-_]/g, " ");
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n*/m, "");
}

// --- Chunking ---

function chunkText(text: string, maxTokens = 500, overlap = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxTokens, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;
    start = end - overlap;
  }
  return chunks;
}

interface Chunk {
  id: string;
  title?: string;
  content: string;
  url?: string;
  tokenCount?: number;
}

// --- Processing ---

async function processGitHubSite(site: DocSite): Promise<Chunk[]> {
  const gh = site.github!;
  console.log(`  Fetching GitHub tree: ${gh.owner}/${gh.repo}`);

  const tree = await fetchGitHubTree(gh.owner, gh.repo);
  const docFiles = tree.filter((item) => {
    if (item.type !== "blob" || !isDocFile(item.path)) return false;
    return gh.paths.some((p) => item.path.startsWith(p));
  });

  console.log(`  Found ${docFiles.length} doc files in ${gh.paths.join(", ")}`);

  const chunks: Chunk[] = [];
  let idx = 0;
  let fetched = 0;

  // Fetch files in batches of 10
  for (let i = 0; i < docFiles.length; i += 10) {
    const batch = docFiles.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (file) => {
        const content = await fetchRawFile(gh.owner, gh.repo, file.path);
        return content ? { path: file.path, content } : null;
      })
    );

    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const { path, content } = r.value;
      fetched++;

      const title = extractTitle(content, path.split("/").pop()!);
      const cleaned = stripFrontmatter(content);
      if (cleaned.trim().length < 30) continue;

      const textChunks = chunkText(cleaned.slice(0, MAX_CONTENT_LENGTH * 5));
      for (const tc of textChunks) {
        chunks.push({
          id: `${site.id}:${idx++}`,
          title,
          content: tc.slice(0, MAX_CONTENT_LENGTH),
          url: `https://github.com/${gh.owner}/${gh.repo}/blob/main/${path}`,
          tokenCount: Math.ceil(tc.split(/\s+/).length * 1.3),
        });
      }
    }

    if ((i + 10) % 50 === 0 || i + 10 >= docFiles.length) {
      console.log(`  Fetched ${fetched}/${docFiles.length} files, ${chunks.length} chunks so far`);
    }
  }

  return chunks;
}

async function ingestChunks(site: DocSite, chunks: Chunk[]): Promise<number> {
  let sent = 0;
  for (let i = 0; i < chunks.length; i += MAX_CHUNKS_PER_REQUEST) {
    const batch = chunks.slice(i, i + MAX_CHUNKS_PER_REQUEST);
    try {
      const res = await fetch(`${API_URL}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          libraryId: site.id,
          name: site.name,
          description: site.description,
          sourceUrl: site.docsUrl,
          sourceType: "crawl",
          chunks: batch,
          replace: i === 0,
          skipEmbeddings: true,
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (res.ok) {
        sent += batch.length;
      } else {
        const err = await res.text().catch(() => "");
        console.log(`  API error: ${res.status} ${err.slice(0, 200)}`);
      }
    } catch (e: any) {
      console.log(`  Request error: ${e.message}`);
    }
  }
  return sent;
}

async function embedLibrary(site: DocSite): Promise<void> {
  let offset = 0;
  while (true) {
    try {
      const res = await fetch(`${API_URL}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ libraryId: site.id, limit: 200, offset }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) break;
      const data = (await res.json()) as any;
      if (data.processed > 0) {
        console.log(`  [${site.name}] ${offset + data.processed}/${data.total} embedded`);
      }
      if (data.done || !data.nextOffset) break;
      offset = data.nextOffset;
    } catch (e: any) {
      console.log(`  [${site.name}] Embed error: ${e.message}`);
      break;
    }
  }
}

async function main() {
  let totalChunks = 0;

  for (const site of SITES) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`Processing: ${site.name}`);

    let chunks: Chunk[] = [];
    if (site.github) {
      chunks = await processGitHubSite(site);
    }

    if (chunks.length === 0) {
      console.log(`  No chunks found for ${site.name}`);
      continue;
    }

    console.log(`  Total chunks: ${chunks.length}`);
    const sent = await ingestChunks(site, chunks);
    console.log(`  [OK] ${site.name}: ${sent} chunks ingested`);
    totalChunks += sent;
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Ingested ${totalChunks} total chunks`);

  console.log(`\nGenerating embeddings...`);
  for (const site of SITES) {
    await embedLibrary(site);
  }

  console.log("\nAll done!");
}

main().catch(console.error);
