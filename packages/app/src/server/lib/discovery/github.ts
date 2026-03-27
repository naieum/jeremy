import type { DiscoveryItem } from "./types";

interface GitHubSearchResponse {
  items: Array<{
    full_name: string;
    name: string;
    description?: string;
    homepage?: string;
    html_url: string;
    stargazers_count: number;
    topics?: string[];
  }>;
}

export async function fetchGitHubRepos(config: {
  topic?: string;
  limit?: number;
}): Promise<DiscoveryItem[]> {
  const topic = config.topic ?? "javascript";
  const limit = config.limit ?? 30;

  const headers: Record<string, string> = {
    "User-Agent": "Jeremy-App",
    Accept: "application/vnd.github.v3+json",
  };

  // Use GITHUB_TOKEN for higher rate limits if available
  try {
    const { env } = await import("cloudflare:workers");
    const token = (env as any).GITHUB_TOKEN;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  } catch {
    // No env available, proceed without token
  }

  const res = await fetch(
    `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(topic)}&sort=stars&per_page=${limit}`,
    {
      headers,
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub search failed: ${res.status}`);
  }

  const data = (await res.json()) as GitHubSearchResponse;

  return data.items.map((repo) => ({
    identifier: repo.full_name,
    name: repo.name,
    websiteUrl: repo.homepage || undefined,
    metadata: {
      description: repo.description,
      stars: repo.stargazers_count,
      githubUrl: repo.html_url,
      topics: repo.topics,
    },
  }));
}
