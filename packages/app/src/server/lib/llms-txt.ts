import { assertValidFetchUrl, isValidFetchUrl } from "./url-validation";

interface LlmsEntry {
  title: string;
  url: string;
}

interface LlmsDoc {
  title: string;
  content: string;
  url: string;
}

function parseLlmsTxt(text: string): LlmsEntry[] {
  const entries: LlmsEntry[] = [];
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^-\s*\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      entries.push({ title: match[1].trim(), url: match[2].trim() });
    }
  }
  return entries;
}

export async function fetchLlmsTxt(llmsTxtUrl: string): Promise<LlmsDoc[]> {
  assertValidFetchUrl(llmsTxtUrl);
  const res = await fetch(llmsTxtUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${llmsTxtUrl}: ${res.status}`);
  const rawText = await res.text();
  const entries = parseLlmsTxt(rawText);

  if (entries.length === 0) {
    return [{ title: "llms.txt", content: rawText, url: llmsTxtUrl }];
  }

  const docs: LlmsDoc[] = [];
  for (const entry of entries) {
    if (!isValidFetchUrl(entry.url)) continue;
    try {
      const r = await fetch(entry.url);
      if (!r.ok) continue;
      docs.push({ title: entry.title, content: await r.text(), url: entry.url });
    } catch {
      // skip failed fetches
    }
  }
  return docs;
}

const CHARS_PER_TOKEN = 4;
const TARGET_CHARS = 500 * CHARS_PER_TOKEN;
const OVERLAP_CHARS = 50 * CHARS_PER_TOKEN;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface IngestChunk {
  id: string;
  title: string;
  content: string;
  url: string;
  tokenCount: number;
}

export function chunkDocs(libraryId: string, docs: LlmsDoc[]): IngestChunk[] {
  const allChunks: IngestChunk[] = [];
  let idx = 0;

  for (const doc of docs) {
    const paragraphs = doc.content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) continue;

    let current: string[] = [];
    let currentLen = 0;

    const flush = () => {
      if (current.length === 0) return;
      const content = current.join("\n\n");
      allChunks.push({
        id: `${libraryId}-${idx++}`,
        title: doc.title,
        content,
        url: doc.url,
        tokenCount: estimateTokens(content),
      });
    };

    for (const para of paragraphs) {
      if (para.length > TARGET_CHARS && current.length === 0) {
        // Force-split oversized paragraph
        let start = 0;
        while (start < para.length) {
          const end = Math.min(start + TARGET_CHARS, para.length);
          const content = para.slice(start, end);
          allChunks.push({
            id: `${libraryId}-${idx++}`,
            title: doc.title,
            content,
            url: doc.url,
            tokenCount: estimateTokens(content),
          });
          if (end === para.length) break;
          start = end - OVERLAP_CHARS;
        }
        continue;
      }

      if (currentLen + para.length > TARGET_CHARS && current.length > 0) {
        flush();
        // overlap: keep last paragraph(s) up to OVERLAP_CHARS
        const overlap: string[] = [];
        let total = 0;
        for (let i = current.length - 1; i >= 0; i--) {
          if (total + current[i].length > OVERLAP_CHARS && overlap.length > 0) break;
          overlap.unshift(current[i]);
          total += current[i].length;
        }
        current = overlap;
        currentLen = total;
      }

      current.push(para);
      currentLen += para.length;
    }
    flush();
  }

  return allChunks;
}
