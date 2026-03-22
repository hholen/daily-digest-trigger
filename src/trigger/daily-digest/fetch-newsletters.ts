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

interface RSSItem {
  title?: string;
  link?: string;
  description?: unknown;
  "content:encoded"?: unknown;
  pubDate?: string;
}

export const fetchNewsletters = task({
  id: "fetch-newsletters",
  retry: { maxAttempts: 2 },
  run: async (): Promise<CollectedItem[]> => {
    const items: CollectedItem[] = [];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const parser = new XMLParser({ ignoreAttributes: false });

    for (const feed of digestConfig.sources.newsletters.feeds) {
      try {
        const response = await fetch(feed.feedUrl, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          logger.warn(`${feed.name}: HTTP ${response.status}`);
          continue;
        }

        const xml = await response.text();
        const parsed = parser.parse(xml);
        const entries: RSSItem[] =
          parsed?.rss?.channel?.item ?? [];
        const itemList = Array.isArray(entries) ? entries : [entries];

        for (const entry of itemList) {
          if (!entry.title) continue;

          const pubDate = entry.pubDate
            ? new Date(entry.pubDate).getTime()
            : 0;
          if (pubDate < oneDayAgo) continue;

          const content =
            textOf(entry["content:encoded"]) || textOf(entry.description);

          items.push({
            title: String(entry.title),
            url: String(entry.link ?? ""),
            snippet: content
              .replace(/<[^>]*>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 500),
            source: feed.name,
            sourceType: "newsletter",
            publishedAt: entry.pubDate ?? new Date().toISOString(),
          });
        }

        logger.info(`${feed.name}: checked ${itemList.length} entries`);
      } catch (error) {
        logger.warn(`Error fetching ${feed.name}: ${error}`);
      }
    }

    logger.info(`Newsletters: collected ${items.length} items`);
    return items;
  },
});
