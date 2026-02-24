import { DocChunk } from "./client.js";

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

export function normalizeContent(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export function formatChunk(chunk: DocChunk): string {
  const content = normalizeContent(chunk.content);

  if (!chunk.title) return content;

  // Skip title header if content already starts with it as a markdown heading
  const firstLine = content.split("\n", 1)[0];
  const stripped = firstLine.replace(/^#+\s*/, "").trim();
  if (stripped.toLowerCase() === chunk.title.trim().toLowerCase()) {
    return content;
  }

  return `## ${chunk.title}\n${content}`;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncateToTokens(text: string, budget: number): string {
  const charBudget = budget * 4;
  if (text.length <= charBudget) return text;

  const truncated = text.slice(0, charBudget);

  // Try to break at sentence boundary
  const lastSentence = truncated.search(/[.!?]\s[^.!?]*$/);
  if (lastSentence > charBudget * 0.5) {
    return truncated.slice(0, lastSentence + 1) + "\n\n[truncated]";
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > charBudget * 0.5) {
    return truncated.slice(0, lastSpace) + "\n\n[truncated]";
  }

  return truncated + "\n\n[truncated]";
}

export function budgetChunks(chunks: DocChunk[], maxTokens: number = 3000): string {
  const parts: string[] = [];
  let remaining = maxTokens;

  for (const chunk of chunks) {
    const formatted = formatChunk(chunk);
    const cost = estimateTokens(formatted);

    if (cost <= remaining) {
      parts.push(formatted);
      remaining -= cost;
    } else if (remaining > 50) {
      parts.push(truncateToTokens(formatted, remaining));
      break;
    } else {
      break;
    }
  }

  return parts.join("\n\n");
}

export function formatSourceFooter(chunks: DocChunk[]): string {
  const urls = chunks
    .map((c) => c.url)
    .filter((url): url is string => !!url);
  const unique = [...new Set(urls)];
  if (unique.length === 0) return "";
  return `\n\nSources: ${unique.join(" · ")}`;
}
