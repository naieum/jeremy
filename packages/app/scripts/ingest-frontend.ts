/**
 * Ingest frontend design libraries that have llms.txt files.
 */

const API_URL = "https://jeremy-app.ian-muench.workers.dev";
const API_KEY = "jrmy_10eac3bb041a95da0cdc325e3f5e3bb5fcb9bfeb0a54e0d30f3b1d65cd11bfd5";
const MAX_CHUNKS_PER_REQUEST = 200;
const MAX_CONTENT_LENGTH = 4000;
const MAX_LINKED_DOCS = 100;

interface Library {
  id: string;
  name: string;
  url: string;
  description: string;
}

const LIBRARIES: Library[] = [
  { id: "/ibelick/aceternity-ui", name: "Aceternity UI", url: "https://ui.aceternity.com/llms.txt", description: "Copy-paste animated React components with Tailwind CSS and Framer Motion" },
  { id: "/magicuidesign/magicui", name: "Magic UI", url: "https://magicui.design/llms-full.txt", description: "Animated React components for design engineers" },
  { id: "/chakra-ui/ark", name: "Ark UI", url: "https://ark-ui.com/llms.txt", description: "Headless UI components for React, Solid, and Vue" },
];

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

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "JeremyBot/1.0" } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
  finally { clearTimeout(timeout); }
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
        if (content && content.length > 50) return { title: link.title, content: content.slice(0, 50000), url: link.url };
        return null;
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) docs.push(r.value);
    }
  }
  return docs;
}

interface Chunk { id: string; title?: string; content: string; url?: string; tokenCount?: number; }

async function processLibrary(lib: Library): Promise<number> {
  console.log(`\nFetching ${lib.name}: ${lib.url}`);
  const text = await fetchWithTimeout(lib.url, 20000);
  if (!text) { console.log(`  FAILED to fetch`); return 0; }
  console.log(`  Fetched ${(text.length / 1024).toFixed(0)}KB`);

  const chunks: Chunk[] = [];
  let idx = 0;

  // Check if it's full content or index
  const links = extractLinkedDocs(text);
  const isIndex = links.length > 5 && text.length < links.length * 200;

  if (!isIndex || text.length > 50000) {
    // Full content - parse and chunk
    const sections = parseMarkdownSections(text);
    for (const section of sections) {
      const textChunks = chunkText(section.content.slice(0, MAX_CONTENT_LENGTH * 3));
      for (const tc of textChunks) {
        chunks.push({
          id: `${lib.id}:${idx++}`,
          title: section.title || undefined,
          content: tc.slice(0, MAX_CONTENT_LENGTH),
          url: section.url || lib.url,
          tokenCount: Math.ceil(tc.split(/\s+/).length * 1.3),
        });
      }
    }
  }

  // If index-only or few chunks, fetch linked docs
  if (chunks.length < 5 && links.length > 0) {
    console.log(`  Found ${links.length} linked docs, fetching up to ${Math.min(links.length, MAX_LINKED_DOCS)}...`);
    const docs = await fetchLinkedDocs(links);
    console.log(`  Fetched ${docs.length} linked docs`);
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

  if (chunks.length === 0) { console.log(`  No chunks`); return 0; }
  console.log(`  Sending ${chunks.length} chunks...`);

  let sent = 0;
  for (let i = 0; i < chunks.length; i += MAX_CHUNKS_PER_REQUEST) {
    const batch = chunks.slice(i, i + MAX_CHUNKS_PER_REQUEST);
    try {
      const res = await fetch(`${API_URL}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          libraryId: lib.id, name: lib.name, description: lib.description,
          sourceUrl: lib.url, sourceType: "llms_txt",
          chunks: batch, replace: i === 0, skipEmbeddings: true,
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (res.ok) sent += batch.length;
      else console.log(`  API error: ${res.status}`);
    } catch (e: any) { console.log(`  Error: ${e.message}`); }
  }
  console.log(`  [OK] ${lib.name}: ${sent} chunks`);
  return sent;
}

async function main() {
  let total = 0;
  for (const lib of LIBRARIES) {
    total += await processLibrary(lib);
  }
  console.log(`\nIngested ${total} total chunks`);

  // Generate embeddings
  console.log(`\nGenerating embeddings...`);
  for (const lib of LIBRARIES) {
    let offset = 0;
    while (true) {
      try {
        const res = await fetch(`${API_URL}/api/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ libraryId: lib.id, limit: 200, offset }),
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) break;
        const data = await res.json() as any;
        if (data.processed > 0) console.log(`  [${lib.name}] ${offset + data.processed}/${data.total} embedded`);
        if (data.done || !data.nextOffset) break;
        offset = data.nextOffset;
      } catch (e: any) { console.log(`  [${lib.name}] Error: ${e.message}`); break; }
    }
  }
  console.log("\nDone!");
}

main().catch(console.error);
