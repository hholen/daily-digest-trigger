import { task, logger } from "@trigger.dev/sdk";
import { digestConfig } from "../../config/digest.config.js";
import type { CollectedItem } from "./types.js";

interface HNHit {
  objectID: string;
  title: string;
  url: string | null;
  points: number;
  num_comments: number;
  created_at: string;
}

interface HNItem {
  children?: Array<{
    text: string | null;
    author: string;
    children?: unknown[];
  }>;
}

async function fetchArticleSnippet(url: string): Promise<string> {
  try {
    const headers: Record<string, string> = {
      Accept: "text/plain",
    };
    const jinaKey = process.env.JINA_API_KEY;
    if (jinaKey) {
      headers["Authorization"] = `Bearer ${jinaKey}`;
    }

    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return "";

    const text = await response.text();
    return text.trim().slice(0, 1500);
  } catch {
    return "";
  }
}

async function fetchHNComments(objectID: string): Promise<string> {
  try {
    const response = await fetch(
      `https://hn.algolia.com/api/v1/items/${objectID}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) return "";

    const data = (await response.json()) as HNItem;
    const children = data.children ?? [];

    const comments = children
      .slice(0, 10)
      .map((c) => {
        const text = (c.text ?? "")
          .replace(/<[^>]*>/g, " ")
          .replace(/&[a-z]+;/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        return text ? `${c.author}: ${text}` : "";
      })
      .filter(Boolean);

    if (comments.length === 0) return "";

    let result = "";
    for (const comment of comments) {
      if (result.length + comment.length > 2000) break;
      result += comment + "\n";
    }

    return result.trim();
  } catch {
    return "";
  }
}

export const fetchHackerNews = task({
  id: "fetch-hacker-news",
  retry: { maxAttempts: 2 },
  run: async (): Promise<CollectedItem[]> => {
    const items: CollectedItem[] = [];

    const response = await fetch(
      "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30"
    );

    if (!response.ok) {
      logger.error(`HN API failed: ${response.status}`);
      return items;
    }

    const data = (await response.json()) as { hits: HNHit[] };
    const keywordRegex = new RegExp(
      digestConfig.sources.hackerNews.keywords.join("|"),
      "i"
    );

    const relevant = data.hits.filter((hit) => keywordRegex.test(hit.title));
    logger.info(`HN: ${relevant.length} relevant stories out of ${data.hits.length}`);

    const sorted = relevant.sort((a, b) => b.points - a.points);

    for (const hit of sorted) {
      const articleUrl =
        hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;

      const [snippet, comments] = await Promise.all([
        hit.url ? fetchArticleSnippet(hit.url) : Promise.resolve(""),
        hit.num_comments > 5 ? fetchHNComments(hit.objectID) : Promise.resolve(""),
      ]);

      const meta = [`${hit.points} pts, ${hit.num_comments} comments`];
      if (comments) {
        meta.push(`HN discussion:\n${comments}`);
      }

      if (snippet) {
        logger.info(`Fetched article snippet for "${hit.title}" (${snippet.length} chars)`);
      }

      items.push({
        title: hit.title,
        url: articleUrl,
        snippet,
        source: "hacker-news",
        sourceType: "news",
        publishedAt: hit.created_at,
        meta: meta.join("\n\n"),
      });
    }

    logger.info(`HN: collected ${items.length} items`);
    return items;
  },
});
