import { task, logger } from "@trigger.dev/sdk";
import { digestConfig } from "../../config/digest.config.js";
import { fetchChannelVideos } from "../../lib/youtube-api.js";
import { fetchTranscriptText } from "../../lib/supadata.js";
import type { CollectedItem } from "./types.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchYoutube = task({
  id: "fetch-youtube",
  retry: { maxAttempts: 2 },
  run: async (): Promise<CollectedItem[]> => {
    const items: CollectedItem[] = [];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let transcriptCount = 0;

    for (const channel of digestConfig.sources.youtube.channels) {
      try {
        const videos = await fetchChannelVideos(channel.channelId, 10);

        for (const video of videos) {
          const published = new Date(video.publishedAt).getTime();
          if (published < oneDayAgo) continue;

          // Fetch transcript for richer context than the description
          let snippet = video.description.slice(0, 500);
          try {
            // Rate limit: Supadata allows 1 req/sec
            if (transcriptCount > 0) await delay(1100);
            const transcript = await fetchTranscriptText(video.videoId);
            transcriptCount++;
            if (transcript && transcript.length > 50) {
              snippet = transcript.slice(0, 1500);
              logger.info(`Transcript fetched for "${video.title}" (${transcript.length} chars)`);
            }
          } catch (error) {
            logger.warn(`Transcript failed for ${video.videoId}, using description: ${error}`);
          }

          items.push({
            title: video.title,
            url: `https://www.youtube.com/watch?v=${video.videoId}`,
            snippet,
            source: channel.name,
            sourceType: "youtube",
            publishedAt: video.publishedAt,
          });
        }

        logger.info(`${channel.name}: ${videos.length} videos checked, filtered to last 24h`);
      } catch (error) {
        logger.warn(`Error fetching ${channel.name}: ${error}`);
      }
    }

    logger.info(`YouTube: collected ${items.length} items`);
    return items;
  },
});
