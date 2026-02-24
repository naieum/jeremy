/**
 * Bulk ingest script — fetches llms.txt files, chunks docs locally,
 * and sends pre-made chunks to /api/ingest via API key.
 * Sends in small batches (200 chunks per request) to avoid payload limits.
 */

const API_URL = "https://jeremy-app.ian-muench.workers.dev";
const API_KEY = "jrmy_10eac3bb041a95da0cdc325e3f5e3bb5fcb9bfeb0a54e0d30f3b1d65cd11bfd5";
const CONCURRENCY = 3;
const MAX_CHUNKS_PER_REQUEST = 200;
const MAX_CONTENT_LENGTH = 4000; // chars per chunk content
const MAX_LINKED_DOCS = 100; // max sub-docs to fetch from an llms.txt

interface Library {
  id: string;
  name: string;
  url: string;
  description: string;
}

const LIBRARIES: Library[] = [
  // Frontend frameworks
  { id: "/facebook/react", name: "React", url: "https://react.dev/llms.txt", description: "JavaScript library for building user interfaces" },
  { id: "/vuejs/core", name: "Vue.js", url: "https://vuejs.org/llms-full.txt", description: "Progressive JavaScript framework" },
  { id: "/sveltejs/svelte", name: "Svelte", url: "https://svelte.dev/llms.txt", description: "Compile-time reactive UI framework" },
  { id: "/angular/angular", name: "Angular", url: "https://angular.dev/llms.txt", description: "Platform for building web applications" },
  { id: "/facebook/react-native", name: "React Native", url: "https://reactnative.dev/llms.txt", description: "Framework for building native mobile apps" },

  // Meta-frameworks
  { id: "/vercel/next.js", name: "Next.js", url: "https://nextjs.org/docs/llms.txt", description: "React framework for production" },
  { id: "/nuxt/nuxt", name: "Nuxt", url: "https://nuxt.com/llms.txt", description: "Vue.js meta-framework" },
  { id: "/withastro/astro", name: "Astro", url: "https://docs.astro.build/llms.txt", description: "Content-focused web framework" },
  { id: "/expo/expo", name: "Expo", url: "https://docs.expo.dev/llms.txt", description: "Universal React Native platform" },

  // CSS / UI
  { id: "/shadcn-ui/ui", name: "shadcn/ui", url: "https://ui.shadcn.com/llms.txt", description: "Components built with Radix UI and Tailwind" },
  { id: "/chakra-ui/chakra-ui", name: "Chakra UI", url: "https://www.chakra-ui.com/llms.txt", description: "Accessible React component library" },
  { id: "/saadeghi/daisyui", name: "daisyUI", url: "https://daisyui.com/llms.txt", description: "Tailwind CSS component library" },
  { id: "/ant-design/ant-design", name: "Ant Design", url: "https://ant.design/llms.txt", description: "Enterprise-class React UI library" },
  { id: "/nuxt/ui", name: "Nuxt UI", url: "https://ui.nuxt.com/llms.txt", description: "UI component library for Nuxt" },

  // Backend / Runtime
  { id: "/honojs/hono", name: "Hono", url: "https://hono.dev/llms.txt", description: "Ultrafast web framework for the edge" },
  { id: "/elysiajs/elysia", name: "ElysiaJS", url: "https://elysiajs.com/llms.txt", description: "Ergonomic TypeScript web framework for Bun" },
  { id: "/denoland/deno", name: "Deno", url: "https://docs.deno.com/llms-full.txt", description: "Modern JavaScript/TypeScript runtime" },
  { id: "/oven-sh/bun", name: "Bun", url: "https://bun.sh/llms-full.txt", description: "Fast JS runtime, bundler, test runner" },

  // Build tools
  { id: "/vitejs/vite", name: "Vite", url: "https://vite.dev/llms.txt", description: "Next generation frontend build tool" },
  { id: "/vitest-dev/vitest", name: "Vitest", url: "https://vitest.dev/llms.txt", description: "Testing framework powered by Vite" },
  { id: "/vercel/turborepo", name: "Turborepo", url: "https://turborepo.com/llms.txt", description: "High-performance monorepo build system" },
  { id: "/vuejs/vitepress", name: "VitePress", url: "https://vitepress.dev/llms.txt", description: "Vite & Vue powered static site generator" },

  // TanStack
  { id: "/tanstack/tanstack", name: "TanStack", url: "https://tanstack.com/llms.txt", description: "High-quality open-source libraries for web dev" },

  // Databases / ORMs
  { id: "/drizzle-team/drizzle-orm", name: "Drizzle ORM", url: "https://orm.drizzle.team/llms.txt", description: "Lightweight TypeScript ORM" },
  { id: "/prisma/prisma", name: "Prisma", url: "https://www.prisma.io/docs/llms.txt", description: "Next-generation TypeScript ORM" },
  { id: "/neondatabase/neon", name: "Neon", url: "https://neon.com/llms.txt", description: "Serverless Postgres" },
  { id: "/tursodatabase/turso", name: "Turso", url: "https://docs.turso.tech/llms.txt", description: "Edge-hosted distributed database" },
  { id: "/get-convex/convex", name: "Convex", url: "https://docs.convex.dev/llms.txt", description: "Reactive backend-as-a-service" },
  { id: "/electric-sql/electric", name: "ElectricSQL", url: "https://electric-sql.com/llms.txt", description: "Postgres sync for local-first apps" },
  { id: "/redis/redis", name: "Redis", url: "https://redis.io/llms.txt", description: "In-memory data store" },

  // Cloud / Infra
  { id: "/cloudflare/cloudflare-docs", name: "Cloudflare", url: "https://developers.cloudflare.com/llms.txt", description: "Workers, R2, D1, KV, Pages, and more" },
  { id: "/vercel/vercel", name: "Vercel", url: "https://vercel.com/docs/llms-full.txt", description: "Frontend cloud platform" },
  { id: "/supabase/supabase", name: "Supabase", url: "https://supabase.com/llms.txt", description: "Open source Firebase alternative" },
  { id: "/upstash/upstash", name: "Upstash", url: "https://upstash.com/docs/llms.txt", description: "Serverless Redis, Kafka, QStash" },
  { id: "/netlify/netlify", name: "Netlify", url: "https://docs.netlify.com/llms.txt", description: "Web application deployment platform" },
  { id: "/docker/docker", name: "Docker", url: "https://docs.docker.com/llms.txt", description: "Container platform" },

  // Auth
  { id: "/better-auth/better-auth", name: "Better Auth", url: "https://www.better-auth.com/llms.txt", description: "TypeScript auth library" },
  { id: "/clerk/clerk", name: "Clerk", url: "https://clerk.com/llms.txt", description: "User management and auth platform" },

  // Validation / Schema
  { id: "/colinhacks/zod", name: "Zod", url: "https://zod.dev/llms.txt", description: "TypeScript-first schema validation" },
  { id: "/effect-ts/effect", name: "Effect", url: "https://effect.website/llms.txt", description: "TypeScript library for complex programs" },

  // AI / ML
  { id: "/anthropics/anthropic", name: "Anthropic", url: "https://docs.anthropic.com/llms.txt", description: "Claude AI models and APIs" },
  { id: "/openai/openai", name: "OpenAI", url: "https://platform.openai.com/docs/llms.txt", description: "GPT models and APIs" },
  { id: "/vercel/ai", name: "AI SDK", url: "https://ai-sdk.dev/llms.txt", description: "TypeScript toolkit for AI apps" },
  { id: "/modelcontextprotocol/mcp", name: "Model Context Protocol", url: "https://modelcontextprotocol.io/llms-full.txt", description: "Protocol for connecting AI to tools" },
  { id: "/langchain-ai/langchainjs", name: "LangChain JS", url: "https://js.langchain.com/llms.txt", description: "LLM application framework (JS)" },
  { id: "/langchain-ai/langchain", name: "LangChain Python", url: "https://python.langchain.com/llms.txt", description: "LLM application framework (Python)" },
  { id: "/mastra-ai/mastra", name: "Mastra", url: "https://mastra.ai/llms.txt", description: "TypeScript AI agent framework" },
  { id: "/pinecone-io/pinecone", name: "Pinecone", url: "https://docs.pinecone.io/llms.txt", description: "Vector database" },
  { id: "/langfuse/langfuse", name: "Langfuse", url: "https://langfuse.com/llms.txt", description: "LLM observability platform" },

  // Payments / Services
  { id: "/stripe/stripe", name: "Stripe", url: "https://docs.stripe.com/llms.txt", description: "Payment processing platform" },
  { id: "/resend/resend", name: "Resend", url: "https://resend.com/docs/llms.txt", description: "Email API for developers" },

  // Desktop / Mobile
  { id: "/tauri-apps/tauri", name: "Tauri", url: "https://tauri.app/llms.txt", description: "Tiny, fast desktop and mobile apps" },

  // Dev tools
  { id: "/ast-grep/ast-grep", name: "ast-grep", url: "https://ast-grep.github.io/llms.txt", description: "Structural code search and rewriting" },
  { id: "/docs-cursor/cursor", name: "Cursor", url: "https://docs.cursor.com/llms.txt", description: "AI-first code editor" },
  { id: "/postman/postman", name: "Postman", url: "https://learning.postman.com/llms.txt", description: "API development platform" },

  // Background jobs
  { id: "/triggerdotdev/trigger.dev", name: "Trigger.dev", url: "https://trigger.dev/docs/llms.txt", description: "Background job orchestration" },
  { id: "/inngest/inngest", name: "Inngest AgentKit", url: "https://agentkit.inngest.com/llms.txt", description: "Event-driven AI agent toolkit" },

  // CMS
  { id: "/sanity-io/sanity", name: "Sanity", url: "https://www.sanity.io/docs/llms.txt", description: "Composable content platform" },
  { id: "/strapi/strapi", name: "Strapi", url: "https://docs.strapi.io/llms.txt", description: "Open-source headless CMS" },

  // More services
  { id: "/grafbase/grafbase", name: "Grafbase", url: "https://grafbase.com/llms.txt", description: "GraphQL Gateway" },
  { id: "/val-town/val-town", name: "Val Town", url: "https://docs.val.town/llms-full.txt", description: "Deploy apps, APIs, crons with JS" },
  { id: "/axiom-co/axiom", name: "Axiom", url: "https://axiom.co/docs/llms.txt", description: "Log management and observability" },
  { id: "/apify/apify", name: "Apify", url: "https://docs.apify.com/llms.txt", description: "Web scraping and automation" },
  { id: "/tinybird/tinybird", name: "Tinybird", url: "https://www.tinybird.co/docs/llms.txt", description: "Real-time analytics platform" },
  { id: "/mintlify/mintlify", name: "Mintlify", url: "https://mintlify.com/docs/llms.txt", description: "Documentation platform" },
  { id: "/elevenlabs/elevenlabs", name: "ElevenLabs", url: "https://elevenlabs.io/docs/llms.txt", description: "AI voice synthesis" },
  { id: "/jonathanellis/crewai", name: "CrewAI", url: "https://docs.crewai.com/llms.txt", description: "AI agent orchestration" },
  { id: "/gradio-app/gradio", name: "Gradio", url: "https://www.gradio.app/llms.txt", description: "ML web demo builder" },
  { id: "/fireworks-ai/fireworks", name: "Fireworks AI", url: "https://docs.fireworks.ai/llms.txt", description: "Fast AI inference" },
  { id: "/cohere-ai/cohere", name: "Cohere", url: "https://docs.cohere.com/llms.txt", description: "Enterprise AI platform" },
  { id: "/replicate/replicate", name: "Replicate", url: "https://replicate.com/docs/llms.txt", description: "Run ML models via API" },
  { id: "/helicone-ai/helicone", name: "Helicone", url: "https://www.helicone.ai/llms.txt", description: "LLM observability" },
  { id: "/liveblocks/liveblocks", name: "Liveblocks", url: "https://liveblocks.io/llms.txt", description: "Real-time collaboration infra" },
  { id: "/infisical/infisical", name: "Infisical", url: "https://infisical.com/docs/llms.txt", description: "Secret management" },
  { id: "/dubinc/dub", name: "Dub", url: "https://dub.co/docs/llms.txt", description: "Link management platform" },
  { id: "/nuxt/content", name: "Nuxt Content", url: "https://content.nuxt.com/llms.txt", description: "Git-based CMS for Nuxt" },
  { id: "/microsoft/genaiscript", name: "GenAIScript", url: "https://microsoft.github.io/genaiscript/llms.txt", description: "Microsoft's GenAI scripting" },
  { id: "/comfyanonymous/comfyui", name: "ComfyUI", url: "https://docs.comfy.org/llms.txt", description: "Modular Stable Diffusion GUI" },
];

// ── Chunking ───────────────────────────────────────────────────────
const CHARS_PER_TOKEN = 4;
const TARGET_CHARS = 500 * CHARS_PER_TOKEN;
const OVERLAP_CHARS = 50 * CHARS_PER_TOKEN;
function estimateTokens(text: string) { return Math.ceil(text.length / CHARS_PER_TOKEN); }

interface Chunk { id: string; title: string; content: string; url: string; tokenCount: number; }

function chunkText(libId: string, title: string, url: string, text: string, startIdx: number): { chunks: Chunk[]; nextIdx: number } {
  // Truncate very long texts
  const truncated = text.slice(0, 100000);
  const paragraphs = truncated.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  let idx = startIdx;
  let current: string[] = [];
  let currentLen = 0;

  const flush = () => {
    if (!current.length) return;
    const content = current.join("\n\n").slice(0, MAX_CONTENT_LENGTH);
    chunks.push({ id: `${libId}-${idx++}`, title, content, url, tokenCount: estimateTokens(content) });
  };

  for (const para of paragraphs) {
    if (para.length > TARGET_CHARS && !current.length) {
      let start = 0;
      while (start < para.length) {
        const end = Math.min(start + TARGET_CHARS, para.length);
        const content = para.slice(start, end).slice(0, MAX_CONTENT_LENGTH);
        chunks.push({ id: `${libId}-${idx++}`, title, content, url, tokenCount: estimateTokens(content) });
        if (end === para.length) break;
        start = end - OVERLAP_CHARS;
      }
      continue;
    }
    if (currentLen + para.length > TARGET_CHARS && current.length) {
      flush();
      const overlap: string[] = [];
      let total = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        if (total + current[i].length > OVERLAP_CHARS && overlap.length) break;
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
  return { chunks, nextIdx: idx };
}

// ── llms.txt parser ────────────────────────────────────────────────
function parseLlmsTxt(text: string): { title: string; url: string }[] {
  const entries: { title: string; url: string }[] = [];
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^-\s*\[([^\]]+)\]\(([^)]+)\)/);
    if (match) entries.push({ title: match[1].trim(), url: match[2].trim() });
  }
  return entries;
}

async function safeFetch(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length < 20) return null;
    return text;
  } catch { return null; }
}

// ── Send chunks to API in batches ──────────────────────────────────
async function sendChunks(lib: Library, allChunks: Chunk[]): Promise<{ success: boolean; error?: string }> {
  // First request creates/replaces the library and sends first batch
  // Subsequent requests append (no replace flag)
  for (let i = 0; i < allChunks.length; i += MAX_CHUNKS_PER_REQUEST) {
    const batch = allChunks.slice(i, i + MAX_CHUNKS_PER_REQUEST);
    const isFirst = i === 0;

    const body = JSON.stringify({
      libraryId: lib.id,
      name: lib.name,
      description: lib.description,
      sourceUrl: lib.url,
      sourceType: "llms_txt",
      chunks: batch,
      replace: isFirst,
      skipEmbeddings: true, // bulk ingest: skip embeddings for speed
    });

    // Check size before sending
    const sizeMB = new Blob([body]).size / 1024 / 1024;
    if (sizeMB > 90) {
      // Skip this batch if too large
      console.warn(`  [${lib.name}] Batch too large (${sizeMB.toFixed(1)}MB), reducing...`);
      // Try with fewer chunks
      const smaller = batch.slice(0, Math.floor(batch.length / 2));
      const smallerBody = JSON.stringify({
        libraryId: lib.id, name: lib.name, description: lib.description,
        sourceUrl: lib.url, sourceType: "llms_txt", chunks: smaller, replace: isFirst, skipEmbeddings: true,
      });
      const res = await fetch(`${API_URL}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
        body: smallerBody,
      });
      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `API ${res.status}: ${err.slice(0, 200)}` };
      }
      continue;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    const res = await fetch(`${API_URL}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `API ${res.status}: ${err.slice(0, 200)}` };
    }
  }
  return { success: true };
}

// ── Ingest a single library ────────────────────────────────────────
async function ingestLibrary(lib: Library): Promise<{ success: boolean; chunks: number; error?: string }> {
  const tag = `[${lib.name}]`;
  console.log(`${tag} Fetching ${lib.url}...`);

  const mainText = await safeFetch(lib.url, 10000);
  if (!mainText) return { success: false, chunks: 0, error: "Failed to fetch URL" };

  const isLlmsTxt = lib.url.includes("llms");
  const entries = isLlmsTxt ? parseLlmsTxt(mainText) : [];

  let allChunks: Chunk[] = [];

  if (entries.length > 0) {
    // Limit number of sub-docs to avoid huge ingestions
    const limited = entries.slice(0, MAX_LINKED_DOCS);
    console.log(`${tag} Found ${entries.length} linked doc(s), fetching ${limited.length}...`);

    let idx = 0;
    for (let i = 0; i < limited.length; i += 10) {
      const batch = limited.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(async (entry) => {
          const content = await safeFetch(entry.url);
          return content ? { title: entry.title, content, url: entry.url } : null;
        })
      );
      for (const doc of results) {
        if (!doc) continue;
        const { chunks, nextIdx } = chunkText(lib.id, doc.title, doc.url, doc.content, idx);
        allChunks.push(...chunks);
        idx = nextIdx;
      }
    }

    // If no linked docs succeeded, chunk the llms.txt itself
    if (allChunks.length === 0) {
      const { chunks } = chunkText(lib.id, lib.name, lib.url, mainText, 0);
      allChunks = chunks;
    }
  } else {
    // Single document
    const { chunks } = chunkText(lib.id, lib.name, lib.url, mainText, 0);
    allChunks = chunks;
  }

  if (allChunks.length === 0) return { success: false, chunks: 0, error: "No content to chunk" };

  console.log(`${tag} Sending ${allChunks.length} chunks in ${Math.ceil(allChunks.length / MAX_CHUNKS_PER_REQUEST)} batch(es)...`);
  const result = await sendChunks(lib, allChunks);

  if (!result.success) return { success: false, chunks: 0, error: result.error };
  return { success: true, chunks: allChunks.length };
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log(`\nBulk ingesting ${LIBRARIES.length} libraries into Jeremy\n`);

  const results: { name: string; success: boolean; chunks: number; error?: string }[] = [];
  let completed = 0;

  for (let i = 0; i < LIBRARIES.length; i += CONCURRENCY) {
    const batch = LIBRARIES.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (lib) => {
        const result = await ingestLibrary(lib);
        completed++;
        const icon = result.success ? "OK" : "FAIL";
        console.log(`[${icon}] [${completed}/${LIBRARIES.length}] ${lib.name}: ${result.success ? `${result.chunks} chunks` : result.error}`);
        return { name: lib.name, ...result };
      })
    );
    results.push(...batchResults);
  }

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalChunks = succeeded.reduce((sum, r) => sum + r.chunks, 0);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Succeeded: ${succeeded.length}/${results.length} (${totalChunks} total chunks)`);
  if (failed.length > 0) {
    console.log(`Failed: ${failed.length}`);
    for (const f of failed) console.log(`  - ${f.name}: ${f.error}`);
  }
}

main().catch(console.error);
