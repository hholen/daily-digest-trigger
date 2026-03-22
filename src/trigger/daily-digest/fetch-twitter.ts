import { task, logger } from "@trigger.dev/sdk";
import { digestConfig } from "../../config/digest.config.js";
import type { CollectedItem } from "./types.js";

interface FeedlyItem {
  title?: string;
  author?: string;
  summary?: { content?: string };
  published?: number;
  alternate?: Array<{ href: string }>;
  originId?: string;
}

interface FeedlyStream {
  items: FeedlyItem[];
}

export const fetchTwitter = task({
  id: "fetch-twitter",
  retry: { maxAttempts: 2 },
  run: async (): Promise<CollectedItem[]> => {
    const items: CollectedItem[] = [];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const account of digestConfig.sources.twitter.accounts) {
      try {
        const streamId = `feed/https://xcancel.com/${account.handle}/rss`;
        const url = `https://cloud.feedly.com/v3/streams/contents?streamId=${encodeURIComponent(streamId)}&count=20`;

        const response = await fetch(url, {
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          logger.warn(`${account.name}: Feedly API returned ${response.status}`);
          continue;
        }

        const data = (await response.json()) as FeedlyStream;
        let count = 0;

        for (const item of data.items) {
          const published = item.published ?? 0;
          if (published < oneDayAgo) continue;

          // Skip retweets for less noise (they start with "RT by @handle:")
          const title = item.title ?? "";
          if (title.startsWith("RT by @")) continue;

          const tweetUrl =
            item.alternate?.[0]?.href ??
            `https://x.com/${account.handle}/status/${item.originId ?? ""}`;

          // Strip HTML from summary
          const snippet = (item.summary?.content ?? title)
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          items.push({
            title: title.length > 140 ? title.slice(0, 140) + "..." : title,
            url: tweetUrl,
            snippet,
            source: `@${account.handle}`,
            sourceType: "news",
            publishedAt: new Date(published).toISOString(),
          });
          count++;
        }

        logger.info(`@${account.handle}: ${count} tweets in last 24h`);
      } catch (error) {
        logger.warn(`Error fetching @${account.handle}: ${error}`);
      }
    }

    logger.info(`Twitter: collected ${items.length} items`);
    return items;
  },
});
