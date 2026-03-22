import { logger } from "@trigger.dev/sdk";

interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
}

interface PlaylistItemsResponse {
  items?: Array<{
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      resourceId: { videoId: string };
    };
  }>;
}

export async function fetchChannelVideos(
  channelId: string,
  maxResults = 10
): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YT_API_KEY;
  if (!apiKey) {
    logger.warn("YT_API_KEY not set, skipping YouTube fetch");
    return [];
  }

  // Convert channel ID to uploads playlist ID
  const uploadsPlaylistId = channelId.replace(/^UC/, "UU");

  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("playlistId", uploadsPlaylistId);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`YouTube API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as PlaylistItemsResponse;

  return (data.items ?? []).map((item) => ({
    videoId: item.snippet.resourceId.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
  }));
}
