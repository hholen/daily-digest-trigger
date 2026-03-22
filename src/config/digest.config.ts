/**
 * Daily Digest Configuration
 *
 * This is the only file you need to edit.
 * Define your sources, interests, and delivery preferences here.
 */

export const digestConfig = {
  // -----------------------------------------------------------------------
  // Schedule
  // -----------------------------------------------------------------------
  /** Cron expression in UTC. Default: 06:00 UTC (07:00 CET) */
  cron: "0 6 * * *",

  // -----------------------------------------------------------------------
  // Analysis persona
  // -----------------------------------------------------------------------
  /** Describes your role/focus — Claude uses this to filter and frame items */
  persona:
    "a tech founder focused on developer tools, AI/LLMs, and SaaS growth",

  /** Theme categories for grouping items (2-4 recommended) */
  themes: ["AI & Agents", "Growth & PLG", "Builder & Startup"] as const,

  /** Content idea platforms */
  contentPlatforms: ["linkedin", "substack", "both"] as const,

  // -----------------------------------------------------------------------
  // Sources
  // -----------------------------------------------------------------------
  sources: {
    /**
     * Hacker News — filters front page stories by keyword.
     * Uses Algolia API (free), Jina Reader for article text,
     * and Algolia items API for HN comments.
     */
    hackerNews: {
      enabled: true,
      /** Stories matching ANY of these keywords are included */
      keywords: [
        "AI",
        "LLM",
        "agent",
        "startup",
        "SaaS",
        "developer tools",
        // Add your own keywords here
      ],
    },

    /**
     * YouTube channels — fetches recent videos + transcripts.
     * Requires: YT_API_KEY (free, 10k units/day)
     * Requires: SUPADATA_API_KEY (free tier, 1 req/sec)
     *
     * To find a channel ID: go to the channel page, view source,
     * and search for "channelId" or "UC".
     */
    youtube: {
      enabled: true,
      channels: [
        // { name: "Y Combinator", channelId: "UCcefcZRL2oaA_uBNeo5UOWg" },
        // { name: "Fireship", channelId: "UCsBjURrPoezykLs9EqgamOA" },
      ],
    },

    /**
     * Newsletter RSS feeds — most Substack/Ghost newsletters
     * expose an RSS feed at /feed.
     */
    newsletters: {
      enabled: true,
      feeds: [
        // { name: "Lenny's Newsletter", feedUrl: "https://www.lennysnewsletter.com/feed" },
        // { name: "TLDR", feedUrl: "https://tldr.tech/rss" },
      ],
    },

    /**
     * Blog RSS/Atom feeds.
     * Set format to "atom" for Atom feeds, defaults to "rss".
     */
    blogs: {
      enabled: true,
      feeds: [
        // { name: "Simon Willison", feedUrl: "https://simonwillison.net/atom/everything", format: "atom" as const },
        // { name: "Paul Graham", feedUrl: "http://www.paulgraham.com/rss.html", format: "rss" as const },
      ] as Array<{
        name: string;
        feedUrl: string;
        format?: "rss" | "atom";
      }>,
    },

    /**
     * Reddit subreddits — fetches via Atom feed.
     * Set fetchCommentSummary to true if the subreddit has a mod-bot
     * that posts TL;DR summaries on popular threads.
     */
    reddit: {
      enabled: true,
      subreddits: [
        // { name: "r/ClaudeAI", subreddit: "ClaudeAI", fetchCommentSummary: true },
        // { name: "r/LocalLLaMA", subreddit: "LocalLLaMA" },
      ] as Array<{
        name: string;
        subreddit: string;
        fetchCommentSummary?: boolean;
      }>,
    },
  },
};
