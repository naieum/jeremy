/**
 * Iterates through all libraries and generates embeddings for their chunks.
 * Calls /api/embed in batches of 200 chunks per request.
 * Can be run multiple times — it overwrites existing vectors.
 */

const API_URL = "https://jeremy-app.ian-muench.workers.dev";
const API_KEY = "jrmy_10eac3bb041a95da0cdc325e3f5e3bb5fcb9bfeb0a54e0d30f3b1d65cd11bfd5";
const BATCH_SIZE = 200; // chunks per /api/embed call
const CONCURRENCY = 2; // parallel libraries (each library processed sequentially within)
const REQUEST_TIMEOUT = 120_000; // 2 min timeout per API call

interface Library {
  id: string;
  name: string;
  chunkCount: number;
}

async function fetchLibraries(): Promise<Library[]> {
  const res = await fetch(`${API_URL}/api/libraries`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch libraries: ${res.status}`);
  const data = await res.json() as any;
  return (data.libraries ?? data).map((l: any) => ({
    id: l.id,
    name: l.name,
    chunkCount: l.chunkCount ?? l.chunk_count ?? 0,
  }));
}

async function embedBatch(libraryId: string, offset: number): Promise<{
  processed: number;
  total: number;
  nextOffset: number | null;
  done: boolean;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(`${API_URL}/api/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ libraryId, limit: BATCH_SIZE, offset }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    return await res.json() as any;
  } finally {
    clearTimeout(timeout);
  }
}

async function processLibrary(lib: Library): Promise<{ success: boolean; embedded: number }> {
  if (lib.chunkCount === 0) {
    console.log(`  [${lib.name}] 0 chunks, skipping`);
    return { success: true, embedded: 0 };
  }

  let offset = 0;
  let totalEmbedded = 0;

  while (true) {
    try {
      const result = await embedBatch(lib.id, offset);
      totalEmbedded += result.processed;
      console.log(`  [${lib.name}] ${totalEmbedded}/${result.total} chunks embedded`);

      if (result.done || result.nextOffset === null) {
        return { success: true, embedded: totalEmbedded };
      }
      offset = result.nextOffset;
    } catch (e: any) {
      console.error(`  [${lib.name}] ERROR at offset ${offset}: ${e.message}`);
      // Skip to next batch on error (don't get stuck)
      offset += BATCH_SIZE;
      if (offset >= lib.chunkCount) {
        return { success: false, embedded: totalEmbedded };
      }
      // Brief pause before retrying
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  console.log("Fetching libraries...");
  const libraries = await fetchLibraries();
  console.log(`Found ${libraries.length} libraries\n`);

  // Sort by chunk count ascending so small libraries finish first
  libraries.sort((a, b) => a.chunkCount - b.chunkCount);

  const totalChunks = libraries.reduce((s, l) => s + l.chunkCount, 0);
  console.log(`Total chunks to embed: ${totalChunks}\n`);

  let succeeded = 0;
  let failed = 0;
  let totalEmbedded = 0;
  const startTime = Date.now();

  // Process libraries with limited concurrency
  const queue = [...libraries];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const lib = queue.shift()!;
      console.log(`\nProcessing: ${lib.name} (${lib.chunkCount} chunks)`);
      const result = await processLibrary(lib);
      totalEmbedded += result.embedded;
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (totalEmbedded / ((Date.now() - startTime) / 1000)).toFixed(1);
      console.log(`  Progress: ${succeeded + failed}/${libraries.length} libraries, ${totalEmbedded} chunks embedded (${rate}/s, ${elapsed}s elapsed)`);
    }
  });

  await Promise.all(workers);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Done! ${succeeded} succeeded, ${failed} failed`);
  console.log(`${totalEmbedded} total chunks embedded in ${elapsed}s`);
}

main().catch(console.error);
