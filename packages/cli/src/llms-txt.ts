export interface LlmsDoc {
  title: string;
  content: string;
  url: string;
}

interface LlmsEntry {
  title: string;
  url: string;
  description?: string;
}

/**
 * Parse the llms.txt format into a list of entries.
 *
 * The llms.txt format is loosely structured as:
 *   # Title
 *   > description (optional)
 *
 *   ## Section
 *   - [Link Title](url): optional description
 */
function parseLlmsTxt(text: string): LlmsEntry[] {
  const entries: LlmsEntry[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Match markdown link items: - [Title](url) or - [Title](url): description
    const linkMatch = trimmed.match(/^-\s*\[([^\]]+)\]\(([^)]+)\)(?::?\s*(.*))?$/);
    if (linkMatch) {
      const title = linkMatch[1].trim();
      const url = linkMatch[2].trim();
      const description = linkMatch[3]?.trim() || undefined;
      if (title && url) {
        entries.push({ title, url, description });
      }
    }
  }

  return entries;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Fetch an llms.txt file, parse its entries, then fetch the content of each
 * linked document. Returns an array of { title, content, url } objects.
 */
export async function fetchLlmsTxt(llmsTxtUrl: string): Promise<LlmsDoc[]> {
  console.log(`Fetching llms.txt from ${llmsTxtUrl}...`);
  const rawText = await fetchText(llmsTxtUrl);
  const entries = parseLlmsTxt(rawText);

  if (entries.length === 0) {
    console.warn("No linked documents found in llms.txt. Using the file itself as content.");
    return [
      {
        title: "llms.txt",
        content: rawText,
        url: llmsTxtUrl,
      },
    ];
  }

  console.log(`Found ${entries.length} document(s) in llms.txt. Fetching content...`);

  const docs: LlmsDoc[] = [];
  for (const entry of entries) {
    try {
      console.log(`  Fetching: ${entry.title} (${entry.url})`);
      const content = await fetchText(entry.url);
      docs.push({
        title: entry.title,
        content,
        url: entry.url,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  Warning: Could not fetch "${entry.title}" (${entry.url}): ${message}`);
    }
  }

  return docs;
}
