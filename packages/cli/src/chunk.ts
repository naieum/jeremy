export interface Chunk {
  content: string;
  tokenCount: number;
}

const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 500;
const OVERLAP_TOKENS = 50;

const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN; // 2000
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN; // 200

/**
 * Estimate the approximate token count for a string.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split text into paragraphs, preserving blank-line boundaries.
 */
function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Chunk text into ~500-token segments with ~50-token overlap, preferring
 * paragraph boundaries where possible.
 */
export function chunkText(text: string): Chunk[] {
  const paragraphs = splitIntoParagraphs(text);

  if (paragraphs.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  let currentParagraphs: string[] = [];
  let currentLength = 0;

  for (const paragraph of paragraphs) {
    const paragraphLength = paragraph.length;

    // If a single paragraph exceeds the target size, force-split it by characters.
    if (paragraphLength > TARGET_CHARS && currentParagraphs.length === 0) {
      const forcedChunks = forceChunk(paragraph);
      chunks.push(...forcedChunks);
      continue;
    }

    // If adding this paragraph would exceed the target, flush the current batch first.
    if (currentLength + paragraphLength > TARGET_CHARS && currentParagraphs.length > 0) {
      const chunkContent = currentParagraphs.join("\n\n");
      chunks.push({
        content: chunkContent,
        tokenCount: estimateTokens(chunkContent),
      });

      // Carry over the last portion as overlap.
      const overlapParagraphs = buildOverlap(currentParagraphs, OVERLAP_CHARS);
      currentParagraphs = overlapParagraphs;
      currentLength = currentParagraphs.reduce(
        (sum, p) => sum + p.length,
        0,
      );
    }

    currentParagraphs.push(paragraph);
    currentLength += paragraphLength;
  }

  // Flush any remaining content.
  if (currentParagraphs.length > 0) {
    const chunkContent = currentParagraphs.join("\n\n");
    chunks.push({
      content: chunkContent,
      tokenCount: estimateTokens(chunkContent),
    });
  }

  return chunks;
}

/**
 * Force-split a large string into character-level chunks with overlap,
 * used when a single paragraph is too large to fit in one chunk.
 */
function forceChunk(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + TARGET_CHARS, text.length);
    const content = text.slice(start, end);
    chunks.push({
      content,
      tokenCount: estimateTokens(content),
    });
    if (end === text.length) break;
    start = end - OVERLAP_CHARS;
  }

  return chunks;
}

/**
 * Given a list of paragraphs, return enough trailing paragraphs to fill
 * approximately `maxChars` characters, to be used as overlap for the next chunk.
 */
function buildOverlap(paragraphs: string[], maxChars: number): string[] {
  const overlap: string[] = [];
  let total = 0;

  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const len = paragraphs[i].length;
    if (total + len > maxChars && overlap.length > 0) break;
    overlap.unshift(paragraphs[i]);
    total += len;
  }

  return overlap;
}
