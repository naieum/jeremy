/**
 * Ingest missing libraries found from Context7's catalog.
 * These all have llms.txt files available.
 */

const API_URL = "https://jeremy-app.ian-muench.workers.dev";
const API_KEY = "jrmy_10eac3bb041a95da0cdc325e3f5e3bb5fcb9bfeb0a54e0d30f3b1d65cd11bfd5";
const MAX_CHUNKS_PER_REQUEST = 200;
const MAX_CONTENT_LENGTH = 4000;
const MAX_LINKED_DOCS = 100;
const CONCURRENCY = 3;

interface Library {
  id: string;
  name: string;
  url: string;
  description: string;
}

const LIBRARIES: Library[] = [
  // From Context7 popular/trending + our own research
  { id: "/tailwindlabs/tailwindcss", name: "Tailwind CSS", url: "https://tailwindcss.com/docs/llms.txt", description: "Utility-first CSS framework" },
  { id: "/trpc/trpc", name: "tRPC", url: "https://trpc.io/llms-full.txt", description: "End-to-end typesafe APIs" },
  { id: "/solidjs/solid", name: "SolidJS", url: "https://docs.solidjs.com/llms.txt", description: "Simple and performant reactive UI framework" },
  { id: "/tldraw/tldraw", name: "tldraw", url: "https://tldraw.dev/llms.txt", description: "Infinite canvas SDK" },
  { id: "/vercel/swr", name: "SWR", url: "https://swr.vercel.app/llms.txt", description: "React hooks for data fetching" },
  { id: "/mui/material-ui", name: "Material UI", url: "https://mui.com/material-ui/llms.txt", description: "React component library implementing Material Design" },
  { id: "/mantinedev/mantine", name: "Mantine", url: "https://mantine.dev/llms-full.txt", description: "React components and hooks library" },
  { id: "/mrdoob/three.js", name: "Three.js", url: "https://threejs.org/docs/llms-full.txt", description: "3D graphics library for the web" },
  { id: "/fastify/fastify", name: "Fastify", url: "https://fastify.dev/llms-full.txt", description: "Fast and low overhead web framework for Node.js" },
  { id: "/pydantic/pydantic", name: "Pydantic", url: "https://docs.pydantic.dev/latest/llms-full.txt", description: "Data validation using Python type hints" },
  { id: "/run-llama/llama_index", name: "LlamaIndex", url: "https://developers.llamaindex.ai/llms.txt", description: "Data framework for LLM applications" },
  { id: "/stanfordnlp/dspy", name: "DSPy", url: "https://dspy.ai/llms.txt", description: "Programming framework for LM pipelines" },
  { id: "/jlowin/fastmcp", name: "FastMCP", url: "https://gofastmcp.com/llms-full.txt", description: "Fast, Pythonic way to build MCP servers" },
  { id: "/ollama/ollama", name: "Ollama", url: "https://docs.ollama.com/llms-full.txt", description: "Run large language models locally" },
  { id: "/prettier/prettier", name: "Prettier", url: "https://prettier.io/llms-full.txt", description: "Opinionated code formatter" },
  { id: "/firebase/firebase", name: "Firebase", url: "https://firebase.google.com/docs/llms.txt", description: "App development platform by Google" },
];

// --- Chunking logic (same as bulk-ingest.ts) ---

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

function parseMarkdownSections(text: string): { title: string; content: string; url?: string }[] {
  const lines = text.split("\n");
  const sections: { title: string; content: string; url?: string }[] = [];
  let currentTitle = "";
  let currentContent: string[] = [];
  let currentUrl: string | undefined;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentContent.length > 0) {
        sections.push({ title: currentTitle, content: currentContent.join("\n").trim(), url: currentUrl });
      }
      currentTitle = headingMatch[1].trim();
      currentContent = [];
      const urlMatch = currentTitle.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
      currentUrl = urlMatch?.[1];
      currentTitle = currentTitle.replace(/\[([^\]]+)\]\([^)]+\)/, "$1");
    } else {
      currentContent.push(line);
    }
  }
  if (currentContent.length > 0) {
    sections.push({ title: currentTitle, content: currentContent.join("\n").trim(), url: currentUrl });
  }
  return sections.filter(s => s.content.length > 20);
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "JeremyBot/1.0 (documentation indexer)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractLinkedDocs(text: string): { title: string; url: string }[] {
  const links: { title: string; url: string }[] = [];
  const regex = /- \[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    links.push({ title: match[1], url: match[2] });
  }
  return links;
}

async function fetchLinkedDocs(links: { title: string; url: string }[]): Promise<{ title: string; content: string; url: string }[]> {
  const docs: { title: string; content: string; url: string }[] = [];
  const limited = links.slice(0, MAX_LINKED_DOCS);

  for (let i = 0; i < limited.length; i += 10) {
    const batch = limited.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (link) => {
        const content = await fetchWithTimeout(link.url, 8000);
        if (content && content.length > 50) {
          return { title: link.title, content: content.slice(0, 50000), url: link.url };
        }
        return null;
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) docs.push(r.value);
    }
  }
  return docs;
}

interface Chunk {
  id: string;
  title?: string;
  content: string;
  url?: string;
  tokenCount?: number;
}

function processContent(libraryId: string, text: string, sourceUrl?: string): Chunk[] {
  // Check if it's an index (mostly links) or full content
  const links = extractLinkedDocs(text);
  const isIndex = links.length > 5 && text.length < links.length * 200;

  if (!isIndex || text.length > 50000) {
    // It's full content or very large — parse sections and chunk
    const sections = parseMarkdownSections(text);
    const chunks: Chunk[] = [];
    let idx = 0;
    for (const section of sections) {
      const textChunks = chunkText(section.content.slice(0, MAX_CONTENT_LENGTH * 3));
      for (const tc of textChunks) {
        chunks.push({
          id: `${libraryId}:${idx++}`,
          title: section.title || undefined,
          content: tc.slice(0, MAX_CONTENT_LENGTH),
          url: section.url || sourceUrl,
          tokenCount: Math.ceil(tc.split(/\s+/).length * 1.3),
        });
      }
    }
    return chunks;
  }
  return []; // index-only, need to fetch linked docs
}

async function processLibrary(lib: Library): Promise<number> {
  console.log(`\nFetching ${lib.name}: ${lib.url}`);
  const text = await fetchWithTimeout(lib.url, 15000);
  if (!text) {
    console.log(`  FAILED to fetch ${lib.url}`);
    return 0;
  }
  console.log(`  Fetched ${(text.length / 1024).toFixed(0)}KB`);

  let chunks = processContent(lib.id, text, lib.url);

  // If we got an index (few/no chunks), fetch linked docs
  if (chunks.length < 5) {
    const links = extractLinkedDocs(text);
    if (links.length > 0) {
      console.log(`  Found ${links.length} linked doc(s), fetching up to ${Math.min(links.length, MAX_LINKED_DOCS)}...`);
      const docs = await fetchLinkedDocs(links);
      console.log(`  Fetched ${docs.length} linked docs`);
      let idx = chunks.length;
      for (const doc of docs) {
        const docChunks = chunkText(doc.content.slice(0, MAX_CONTENT_LENGTH * 3));
        for (const tc of docChunks) {
          chunks.push({
            id: `${lib.id}:${idx++}`,
            title: doc.title,
            content: tc.slice(0, MAX_CONTENT_LENGTH),
            url: doc.url,
            tokenCount: Math.ceil(tc.split(/\s+/).length * 1.3),
          });
        }
      }
    }
  }

  if (chunks.length === 0) {
    console.log(`  No chunks produced for ${lib.name}`);
    return 0;
  }

  console.log(`  Sending ${chunks.length} chunks...`);

  // Send in batches
  let sent = 0;
  for (let i = 0; i < chunks.length; i += MAX_CHUNKS_PER_REQUEST) {
    const batch = chunks.slice(i, i + MAX_CHUNKS_PER_REQUEST);
    const isFirst = i === 0;
    try {
      const res = await fetch(`${API_URL}/api/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          libraryId: lib.id,
          name: lib.name,
          description: lib.description,
          sourceUrl: lib.url,
          sourceType: "llms_txt",
          chunks: batch,
          replace: isFirst,
          skipEmbeddings: true,
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        console.log(`  API error: ${res.status} ${err.slice(0, 200)}`);
      } else {
        sent += batch.length;
      }
    } catch (e: any) {
      console.log(`  Request failed: ${e.message}`);
    }
  }

  console.log(`  [OK] ${lib.name}: ${sent} chunks ingested`);
  return sent;
}

async function main() {
  console.log(`Ingesting ${LIBRARIES.length} missing libraries...\n`);

  let totalChunks = 0;
  let succeeded = 0;
  let failed = 0;

  const queue = [...LIBRARIES];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const lib = queue.shift()!;
      const count = await processLibrary(lib);
      if (count > 0) {
        succeeded++;
        totalChunks += count;
      } else {
        failed++;
      }
    }
  });

  await Promise.all(workers);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Done! ${succeeded} succeeded, ${failed} failed`);
  console.log(`${totalChunks} total new chunks ingested`);

  // Now generate embeddings for the new libraries
  console.log(`\nGenerating embeddings for new libraries...`);
  for (const lib of LIBRARIES) {
    try {
      let offset = 0;
      while (true) {
        const res = await fetch(`${API_URL}/api/embed`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({ libraryId: lib.id, limit: 200, offset }),
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) break;
        const data = await res.json() as any;
        if (data.processed > 0) {
          console.log(`  [${lib.name}] ${offset + data.processed}/${data.total} embedded`);
        }
        if (data.done || !data.nextOffset) break;
        offset = data.nextOffset;
      }
    } catch (e: any) {
      console.log(`  [${lib.name}] Embed error: ${e.message}`);
    }
  }

  console.log("\nAll done!");
}

main().catch(console.error);
