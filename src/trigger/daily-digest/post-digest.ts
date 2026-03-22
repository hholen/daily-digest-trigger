import { task, logger } from "@trigger.dev/sdk";
import type { DigestOutput, DigestTheme } from "./types.js";

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: Array<{ type: string; text: string }>;
}

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}

function buildThemeBlocks(theme: DigestTheme): SlackBlock[] {
  const blocks: SlackBlock[] = [];
  const lines: string[] = [];

  const allItems = [
    ...theme.news.map((i) => ({ ...i, label: "News" })),
    ...theme.insights.map((i) => ({ ...i, label: "Insight" })),
    ...theme.actions.map((i) => ({ ...i, label: "Action" })),
  ];

  if (allItems.length === 0) return [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: theme.name },
  });

  for (const item of allItems) {
    if (item.headline) {
      lines.push(`*★ ${item.text}*\n<${item.url}|Read more>`);
    } else {
      lines.push(`• ${item.text} (<${item.url}|link>)`);
    }
  }

  const fullText = lines.join("\n");
  for (const chunk of chunkText(fullText, 2900)) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: chunk },
    });
  }

  return blocks;
}

export const postDigest = task({
  id: "post-digest",
  retry: { maxAttempts: 2 },
  run: async (payload: {
    digest: DigestOutput;
    itemCount: number;
  }): Promise<void> => {
    const { digest, itemCount } = payload;
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
      logger.error("SLACK_WEBHOOK_URL not set");
      return;
    }

    const blocks: SlackBlock[] = [];

    // Header
    const today = new Date().toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: `Daily Digest — ${today}` },
    });
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `${itemCount} items collected and filtered` },
      ],
    });
    blocks.push({ type: "divider" });

    // Themed sections
    for (const theme of digest.themes) {
      blocks.push(...buildThemeBlocks(theme));
      blocks.push({ type: "divider" });
    }

    // Quick hits
    if (digest.quickHits.length > 0) {
      blocks.push({
        type: "header",
        text: { type: "plain_text", text: "Quick Hits" },
      });
      const quickLines = digest.quickHits
        .map((h) => `• ${h.text} (<${h.url}|link>)`)
        .join("\n");
      for (const chunk of chunkText(quickLines, 2900)) {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: chunk },
        });
      }
      blocks.push({ type: "divider" });
    }

    // Content ideas
    if (digest.contentIdeas.length > 0) {
      blocks.push({
        type: "header",
        text: { type: "plain_text", text: "Content Ideas" },
      });
      const ideaLines = digest.contentIdeas
        .map((idea) => {
          const sources = idea.sourceUrls
            .map((u) => `<${u}|source>`)
            .join(", ");
          return `*${idea.hook}*\n${idea.angle} _(${idea.platform})_ ${sources}`;
        })
        .join("\n\n");
      for (const chunk of chunkText(ideaLines, 2900)) {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: chunk },
        });
      }
    }

    // Post to Slack
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error(`Slack webhook failed: ${response.status} ${body}`);
      throw new Error(`Slack webhook failed: ${response.status}`);
    }

    logger.info("Digest posted to Slack");
  },
});
