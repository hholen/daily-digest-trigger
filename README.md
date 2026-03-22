# Daily Digest — AI-Powered News Pipeline

A [Trigger.dev](https://trigger.dev) pipeline that collects content from across the web, uses Claude to filter and analyse it, and posts a themed daily digest to Slack.

Every morning you get a Slack message with the most interesting items from Hacker News, YouTube, newsletters, blogs, and Reddit — grouped by theme, with headlines, quick hits, and content ideas.

## How it works

```
Schedule (cron)
    │
    ├── fetch-hacker-news   (Algolia API + Jina Reader + HN comments)
    ├── fetch-youtube        (YouTube Data API + Supadata transcripts)
    ├── fetch-newsletters    (RSS feeds)
    ├── fetch-blogs          (RSS/Atom feeds)
    └── fetch-reddit         (Atom feeds + mod-bot TL;DRs)
          │
          ▼
    analyse-digest           (Claude Sonnet — filter, theme, generate ideas)
          │
          ▼
    post-digest              (Slack webhook with Block Kit formatting)
```

All five fetchers run in parallel. The orchestrator collects results, sends them to Claude for analysis, and posts the output to Slack.

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/yourusername/daily-digest-trigger.git
cd daily-digest-trigger
npm install
```

### 2. Configure your sources

Edit `src/config/digest.config.ts` — this is the **only file you need to touch**. It controls:

- **Schedule** — when the digest runs (default: 06:00 UTC)
- **Persona** — tells Claude what you care about, so it filters accordingly
- **Themes** — how items get grouped (2-4 recommended)
- **Sources** — which fetchers run and what they pull

```typescript
export const digestConfig = {
  cron: "0 6 * * *",
  persona: "a tech founder focused on developer tools, AI/LLMs, and SaaS growth",
  themes: ["AI & Agents", "Growth & PLG", "Builder & Startup"],
  sources: {
    hackerNews: {
      enabled: true,
      keywords: ["AI", "LLM", "agent", "startup", "SaaS", "developer tools"],
    },
    youtube: {
      enabled: true,
      channels: [
        { name: "Y Combinator", channelId: "UCcefcZRL2oaA_uBNeo5UOWg" },
      ],
    },
    // ... newsletters, blogs, reddit
  },
};
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

**Required:**

| Variable | Description |
|----------|-------------|
| `TRIGGER_SECRET_KEY` | Your [trigger.dev](https://trigger.dev) API key |
| `ANTHROPIC_API_KEY` | Claude API key from [console.anthropic.com](https://console.anthropic.com) |
| `SLACK_WEBHOOK_URL` | Slack [incoming webhook](https://api.slack.com/messaging/webhooks) URL |

**Optional (improve content quality):**

| Variable | Description |
|----------|-------------|
| `JINA_API_KEY` | [Jina Reader](https://jina.ai/reader) API key — fetches clean article text for HN stories |
| `YT_API_KEY` | YouTube Data API v3 key — needed if you enable YouTube channels |
| `SUPADATA_API_KEY` | [Supadata](https://supadata.ai) API key — fetches YouTube transcripts for deeper analysis |

### 4. Run locally

```bash
npx trigger.dev dev
```

This connects to Trigger.dev's dev server and registers your tasks. You can trigger a test run from the Trigger.dev dashboard.

### 5. Deploy

```bash
npx trigger.dev deploy
```

Set your environment variables in the Trigger.dev dashboard under your project settings.

## What each fetcher does

### Hacker News
Pulls the top 30 stories from HN's front page via the [Algolia API](https://hn.algolia.com/api), filters by your keywords, then enriches each story with:
- **Article content** via [Jina Reader](https://jina.ai/reader) (up to 1500 chars of clean text)
- **HN discussion** via Algolia's items API (top 10 comments, stripped of HTML)

### YouTube
Fetches recent videos from configured channels using the YouTube Data API v3. For each video published in the last 24h, fetches the transcript via [Supadata](https://supadata.ai) for much richer context than the title alone. Rate-limited to 1 request/second.

### Newsletters
Parses RSS feeds (most Substack/Ghost newsletters expose one at `/feed`). Filters to items from the last 24 hours and strips HTML.

### Blogs
Supports both RSS and Atom feeds (set `format: "atom"` in the config). Same 24-hour filtering.

### Reddit
Fetches subreddit content via Reddit's Atom RSS feed. For subreddits with `fetchCommentSummary: true`, also fetches the post's JSON comments looking for stickied mod-bot TL;DR summaries — these are high-signal community summaries that appear after 200+ comments.

## Finding channel/feed IDs

**YouTube channel ID:** Go to the channel page → View Source → search for `channelId` or look for `UC` in the URL.

**Newsletter RSS:** Most Substack newsletters are at `https://newsletter.substack.com/feed`. Ghost blogs use `/rss/`.

**Reddit subreddits:** Just the subreddit name without `r/` (e.g., `"ClaudeAI"` not `"r/ClaudeAI"`).

## Cost

- **Claude API:** ~$0.02-0.05 per digest run (Sonnet, depending on item count)
- **Trigger.dev:** Free tier covers daily runs easily
- **Jina Reader:** Free tier available (no key needed, key gets higher limits)
- **YouTube Data API:** Free, 10,000 units/day
- **Supadata:** Free tier, rate limited to 1 req/sec

## Customising the analysis

The Claude analysis prompt is built dynamically from your config. Change `persona` and `themes` in `digest.config.ts` to completely reshape what gets highlighted.

The analysis task lives in `src/trigger/daily-digest/analyse-digest.ts` if you want to customise the prompt further — for example, changing the number of headline items or adjusting the content idea format.

## Known pitfalls

- **Reddit RSS is Atom, not RSS** — the fetcher handles this, but be aware if you're debugging
- **Supadata rate limit** — 1 request per second on the free tier. The YouTube fetcher adds a 1.1s delay between calls
- **Slack Block Kit** — sections have a 3000-character limit. The post task chunks long text automatically
- **fast-xml-parser** — with `ignoreAttributes: false`, text fields can be objects like `{ "#text": "...", "@_type": "html" }`. All fetchers use a `textOf()` helper to handle this safely

## Licence

MIT
