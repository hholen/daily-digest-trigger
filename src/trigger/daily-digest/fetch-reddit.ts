import { task, logger } from "@trigger.dev/sdk";
import { XMLParser } from "fast-xml-parser";
import { digestConfig } from "../../config/digest.config.js";
import type { CollectedItem } from "./types.js";

function textOf(field: unknown): string {
  if (typeof field === "string") return field;
  if (field && typeof field === "object" && "#text" in field) {
    return String((field as Record<string, unknown>)["#text"]);
  }
  return "";
}

function getAtomLink(link: unknown): string {
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    const alt = link.find(
      (l: Record<string, unknown>) =>
        l["@_rel"] === "alternate" || !l["@_rel"]
    );
    return String(alt?.["@_href"] ?? link[0]?.["@_href"] ?? "");
  }
  if (link && typeof link === "object" && "@_href" in link) {
    return String((link as Record<string, unknown>)["@_href"]);
  }
  return "";
}

async function fetchTldr(postUrl: string): Promise<string | undefined> {
  try {
    const jsonUrl = postUrl.endsWith("/")
      ? `${postUrl}.json?sort=top&limit=10`
      : `${postUrl}/.json?sort=top&limit=10`;

    const response = await fetch(jsonUrl, {
      headers: { "User-Agent": "digest-bot/1.0" },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return undefined;

    const data = await response.json();
    if (!Array.isArray(data) || data.length < 2) return undefined;

    const comments = data[1]?.data?.children ?? [];

    // Look for stickied mod-bot TL;DR first
    for (const comment of comments) {
      const body: string = comment?.data?.body ?? "";
      const isStickied: boolean = comment?.data?.stickied ?? false;
      if (isStickied && /tl;?dr/i.test(body)) {
        return body.slice(0, 1500);
      }
    }

    // Fall back to any top comment starting with TL;DR
    for (const comment of comments) {
      const body: string = comment?.data?.body ?? "";
      if (/^(\*\*)?tl;?dr/i.test(body)) {
        return body.slice(0, 1500);
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

interface AtomEntry {
  title?: unknown;
  link?: unknown;
  content?: unknown;
  updated?: string;
}

export const fetchReddit = task({
  id: "fetch-reddit",
  retry: { maxAttempts: 2 },
  run: async (): Promise<CollectedItem[]> => {
    const items: CollectedItem[] = [];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const parser = new XMLParser({ ignoreAttributes: false });

    for (const sub of digestConfig.sources.reddit.subreddits) {
      try {
        const response = await fetch(
          `https://www.reddit.com/r/${sub.subreddit}/.rss`,
          {
            headers: { "User-Agent": "digest-bot/1.0" },
            signal: AbortSignal.timeout(10000),
          }
        );

        if (!response.ok) {
          logger.warn(`${sub.name}: HTTP ${response.status}`);
          continue;
        }

        const xml = await response.text();
        const parsed = parser.parse(xml);

        const entries: AtomEntry[] = parsed?.feed?.entry ?? [];
        const entryList = Array.isArray(entries) ? entries : [entries];

        for (const entry of entryList) {
          const dateStr = entry.updated;
          const pubDate = dateStr ? new Date(dateStr).getTime() : 0;
          if (pubDate < oneDayAgo) continue;

          const title = textOf(entry.title) || "Untitled";
          const url = getAtomLink(entry.link);
          const content = textOf(entry.content);

          let meta: string | undefined;
          if (sub.fetchCommentSummary) {
            const tldr = await fetchTldr(url);
            if (tldr) {
              meta = `Community TL;DR:\n${tldr}`;
              logger.info(`TL;DR found for "${title}"`);
            }
          }

          items.push({
            title,
            url,
            snippet: content
              .replace(/<[^>]*>/g, " ")
              .replace(/&[a-z]+;/gi, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 500),
            source: sub.name,
            sourceType: "reddit",
            publishedAt: dateStr ?? new Date().toISOString(),
            meta,
          });
        }

        logger.info(`${sub.name}: checked ${entryList.length} entries`);
      } catch (error) {
        logger.warn(`Error fetching ${sub.name}: ${error}`);
      }
    }

    logger.info(`Reddit: collected ${items.length} items`);
    return items;
  },
});
