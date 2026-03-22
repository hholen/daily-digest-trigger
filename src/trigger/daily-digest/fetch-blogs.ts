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

interface AtomEntry {
  title?: unknown;
  link?: unknown;
  summary?: unknown;
  content?: unknown;
  published?: string;
  updated?: string;
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

export const fetchBlogs = task({
  id: "fetch-blogs",
  retry: { maxAttempts: 2 },
  run: async (): Promise<CollectedItem[]> => {
    const items: CollectedItem[] = [];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const parser = new XMLParser({ ignoreAttributes: false });

    for (const feed of digestConfig.sources.blogs.feeds) {
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

        const isAtom = feed.format === "atom";

        if (isAtom) {
          const entries: AtomEntry[] = parsed?.feed?.entry ?? [];
          const entryList = Array.isArray(entries) ? entries : [entries];

          for (const entry of entryList) {
            const dateStr = entry.published || entry.updated;
            const pubDate = dateStr ? new Date(dateStr).getTime() : 0;
            if (pubDate < oneDayAgo) continue;

            const content = textOf(entry.content) || textOf(entry.summary);

            items.push({
              title: textOf(entry.title) || "Untitled",
              url: getAtomLink(entry.link),
              snippet: content
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 500),
              source: feed.name,
              sourceType: "blog",
              publishedAt: dateStr ?? new Date().toISOString(),
            });
          }

          logger.info(`${feed.name}: checked ${entryList.length} Atom entries`);
        } else {
          const entries: RSSItem[] = parsed?.rss?.channel?.item ?? [];
          const entryList = Array.isArray(entries) ? entries : [entries];

          for (const entry of entryList) {
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
              sourceType: "blog",
              publishedAt: entry.pubDate ?? new Date().toISOString(),
            });
          }

          logger.info(`${feed.name}: checked ${entryList.length} RSS entries`);
        }
      } catch (error) {
        logger.warn(`Error fetching ${feed.name}: ${error}`);
      }
    }

    logger.info(`Blogs: collected ${items.length} items`);
    return items;
  },
});
