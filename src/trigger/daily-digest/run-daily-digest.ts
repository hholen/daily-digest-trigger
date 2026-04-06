import { schedules, batch, logger } from "@trigger.dev/sdk";
import { digestConfig } from "../../config/digest.config.js";
import { fetchHackerNews } from "./fetch-hacker-news.js";
import { fetchYoutube } from "./fetch-youtube.js";
import { fetchNewsletters } from "./fetch-newsletters.js";
import { fetchBlogs } from "./fetch-blogs.js";
import { fetchReddit } from "./fetch-reddit.js";
import { fetchTwitter } from "./fetch-twitter.js";
import { analyseDigest } from "./analyse-digest.js";
import { postDigest } from "./post-digest.js";
import type { CollectedItem } from "./types.js";

export const runDailyDigest = schedules.task({
  id: "run-daily-digest",
  cron: digestConfig.cron,
  run: async () => {
    logger.info("Starting daily digest");

    // Build list of enabled fetchers
    const fetchers: Array<{ id: string; task: typeof fetchHackerNews }> = [];

    if (digestConfig.sources.hackerNews.enabled) {
      fetchers.push({ id: "hn", task: fetchHackerNews });
    }
    if (digestConfig.sources.youtube.enabled && digestConfig.sources.youtube.channels.length > 0) {
      fetchers.push({ id: "yt", task: fetchYoutube });
    }
    if (digestConfig.sources.newsletters.enabled && digestConfig.sources.newsletters.feeds.length > 0) {
      fetchers.push({ id: "newsletters", task: fetchNewsletters });
    }
    if (digestConfig.sources.blogs.enabled && digestConfig.sources.blogs.feeds.length > 0) {
      fetchers.push({ id: "blogs", task: fetchBlogs });
    }
    if (digestConfig.sources.reddit.enabled && digestConfig.sources.reddit.subreddits.length > 0) {
      fetchers.push({ id: "reddit", task: fetchReddit });
    }
    if (digestConfig.sources.twitter.enabled && digestConfig.sources.twitter.accounts.length > 0) {
      fetchers.push({ id: "twitter", task: fetchTwitter });
    }

    if (fetchers.length === 0) {
      logger.warn("No sources enabled — check digest.config.ts");
      return;
    }

    logger.info(`Running ${fetchers.length} fetchers`);

    // Fan out — trigger all fetchers in parallel (triggerByTaskAndWait preserves output types)
    const results = await batch.triggerByTaskAndWait(
      fetchers.map((f) => ({ task: f.task, payload: {} }))
    );

    // Collect all items
    const allItems: CollectedItem[] = [];
    for (const result of results.runs) {
      if (result.ok) {
        allItems.push(...result.output);
      } else {
        logger.warn(`Fetcher failed: ${result.taskIdentifier}`);
      }
    }

    logger.info(`Collected ${allItems.length} items from ${fetchers.length} sources`);

    if (allItems.length === 0) {
      logger.warn("No items collected — skipping analysis");
      return;
    }

    // Analyse with Claude
    const analysisResult = await analyseDigest.triggerAndWait({
      items: allItems,
    });

    if (!analysisResult.ok) {
      logger.error("Analysis failed");
      return;
    }

    // Post to Slack
    await postDigest.triggerAndWait({
      digest: analysisResult.output,
      itemCount: allItems.length,
    });

    logger.info("Daily digest complete");
  },
});
