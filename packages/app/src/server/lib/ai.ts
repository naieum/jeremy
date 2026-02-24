import { env } from "cloudflare:workers";
import { isValidFetchUrl } from "./url-validation";

interface LibrarySpec {
  name: string;
  id: string;
  sourceUrl: string;
  sourceType: string;
  description: string;
}

interface ClarificationResponse {
  clarification: string;
}

export type AiResponse =
  | { type: "library"; data: LibrarySpec }
  | { type: "clarification"; message: string };

const SYSTEM_PROMPT = `You are a helpful assistant for a documentation library management system called Jeremy.

When the user asks to add a library, extract the following fields and respond with ONLY valid JSON (no markdown, no code fences):
{
  "name": "Human-readable library name",
  "id": "owner/repo-style ID like /facebook/react or /vercel/next.js",
  "sourceUrl": "The documentation URL provided",
  "sourceType": "llms_txt if the URL ends in llms.txt or llms-full.txt, otherwise crawl",
  "description": "A brief 1-sentence description of what this library does"
}

Rules:
- The "id" should be lowercase, using slashes like a path (e.g. /tanstack/router, /facebook/react)
- If the URL contains "llms.txt" or "llms-full.txt", sourceType is "llms_txt", otherwise "crawl"
- The description should be concise and accurate based on your knowledge of the library
- If the user's message is unclear or missing a URL, respond with: {"clarification": "Your question asking for what you need"}
- Always respond with valid JSON only, never include markdown formatting or code fences`;

export async function extractLibraryInfo(
  userMessage: string
): Promise<AiResponse> {
  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    max_tokens: 512,
    temperature: 0.1,
  });

  const text = (result as any).response?.trim() ?? "";

  // Try to extract JSON from the response (handle possible markdown fences)
  let jsonStr = text;
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  let parsed: LibrarySpec | ClarificationResponse;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // If we can't parse JSON, treat the whole response as a clarification
    return { type: "clarification", message: text || "I didn't understand that. Could you try again?" };
  }

  if ("clarification" in parsed) {
    return { type: "clarification", message: (parsed as ClarificationResponse).clarification };
  }

  const spec = parsed as LibrarySpec;

  // Validate required fields
  if (!spec.name || !spec.sourceUrl) {
    return {
      type: "clarification",
      message: "I couldn't extract the library details. Please provide a message like: add react docs https://react.dev/llms.txt",
    };
  }

  // Validate URL format and safety
  if (!isValidFetchUrl(spec.sourceUrl)) {
    return {
      type: "clarification",
      message: "The URL doesn't look valid. Please provide a public HTTP/HTTPS documentation URL.",
    };
  }

  // Validate and sanitize ID format (only allow alphanumeric, slashes, hyphens, dots)
  if (spec.id && !/^[a-zA-Z0-9/_.-]+$/.test(spec.id.replace(/^\//, ""))) {
    return {
      type: "clarification",
      message: "The extracted library ID contains invalid characters. Please try again with a clearer library name.",
    };
  }

  // Ensure id has leading slash
  if (spec.id && !spec.id.startsWith("/")) {
    spec.id = "/" + spec.id;
  }

  // Validate sourceType is an expected value
  const validSourceTypes = ["llms_txt", "crawl", "manual"];
  if (!spec.sourceType || !validSourceTypes.includes(spec.sourceType)) {
    spec.sourceType = spec.sourceUrl.includes("llms") ? "llms_txt" : "crawl";
  }

  // Truncate description to prevent abuse
  if (spec.description && spec.description.length > 500) {
    spec.description = spec.description.slice(0, 500);
  }

  return { type: "library", data: spec };
}
