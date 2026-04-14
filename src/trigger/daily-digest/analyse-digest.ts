import { task, logger } from "@trigger.dev/sdk";
import Anthropic from "@anthropic-ai/sdk";
import { digestConfig } from "../../config/digest.config.js";
import type { CollectedItem, DigestOutput } from "./types.js";

const anthropic = new Anthropic();

function buildAnalysisPrompt(): string {
  const themeList = digestConfig.themes.join('", "');
  const platforms = digestConfig.contentPlatforms
    .filter((p) => p !== "both")
    .join("/");

  return `You are a daily intelligence analyst for ${digestConfig.persona}.

Here are today's collected items from across the web. Each has a title, URL, snippet (if available), source, and type.

Your job:
1. FILTER ruthlessly — only include items that are genuinely interesting, novel, or actionable. Drop fluff, minor updates, duplicates across sources. Aim for 12-18 total items.
2. Select 3-5 "headline" items that deserve 1-2 sentences of context explaining why they matter.
3. The rest are "regular" items — one short sentence + link.
4. Group items by theme: "${themeList}"
5. Within each theme, classify as: News (what happened), Insight (why it matters, contrarian take), or Action (something to try/apply).
6. Put remaining interesting-but-lower-priority items in quickHits — just a short label, no theme.
7. Generate 3-5 content ideas for ${platforms} — contrarian takes, frameworks, or angles worth writing about. Each needs a hook (headline), angle (one sentence on the take), platform, and sourceUrls (array of URLs from today's items that inspired the idea).

Rules:
- Be concise. Headlines get 1-2 sentences. Regular items get ONE short sentence.
- Write like a sharp founder briefing a peer, not a news anchor.
- Prefer contrarian or non-obvious framing over straight reporting.
- Content ideas should be things worth actually writing, not generic suggestions.
- Some items have a "meta" field with community discussion (HN comments, Reddit TL;DRs from 200+ comment threads). These represent high-signal community sentiment — use them to inform your analysis and surface the most discussed topics.
- YouTube items include transcript excerpts — use these to understand what was actually discussed, not just the title.

Call the submit_digest tool with your analysis.`;
}

const digestItemSchema = {
  type: "object",
  required: ["text", "url", "headline"],
  properties: {
    text: { type: "string" },
    url: { type: "string" },
    headline: { type: "boolean" },
  },
} as const;

/**
 * Build the analyser tool schema from digestConfig. Theme names and platform
 * values come from user config so the enum is dynamic per-deployment.
 */
function buildDigestTool(): Anthropic.Tool {
  return {
    name: "submit_digest",
    description:
      "Submit the analysed daily digest grouped by theme with quick hits and content ideas.",
    input_schema: {
      type: "object",
      required: ["themes", "quickHits", "contentIdeas"],
      properties: {
        themes: {
          type: "array",
          items: {
            type: "object",
            required: ["name", "news", "insights", "actions"],
            properties: {
              name: { type: "string", enum: [...digestConfig.themes] },
              news: { type: "array", items: digestItemSchema },
              insights: { type: "array", items: digestItemSchema },
              actions: { type: "array", items: digestItemSchema },
            },
          },
        },
        quickHits: {
          type: "array",
          items: {
            type: "object",
            required: ["text", "url"],
            properties: {
              text: { type: "string" },
              url: { type: "string" },
            },
          },
        },
        contentIdeas: {
          type: "array",
          items: {
            type: "object",
            required: ["hook", "angle", "platform", "sourceUrls"],
            properties: {
              hook: { type: "string" },
              angle: { type: "string" },
              platform: {
                type: "string",
                enum: [...digestConfig.contentPlatforms],
              },
              sourceUrls: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  };
}

export const analyseDigest = task({
  id: "analyse-digest",
  retry: { maxAttempts: 2 },
  run: async (payload: { items: CollectedItem[] }): Promise<DigestOutput> => {
    const { items } = payload;
    logger.info(`Analysing ${items.length} collected items`);

    if (items.length === 0) {
      logger.warn("No items to analyse");
      return { themes: [], quickHits: [], contentIdeas: [] };
    }

    const itemsJson = JSON.stringify(
      items.map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet.slice(
          0,
          ["youtube", "news"].includes(item.sourceType) ? 1500 : 500
        ),
        source: item.source,
        type: item.sourceType,
        meta: item.meta || undefined,
      })),
      null,
      0
    );

    const tool = buildDigestTool();

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: `${buildAnalysisPrompt()}\n\nToday's collected items:\n${itemsJson}`,
        },
      ],
    });

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      logger.error(
        `No tool_use block in response. stop_reason=${message.stop_reason} usage=${JSON.stringify(message.usage)}`
      );
      throw new Error("Claude did not invoke submit_digest tool");
    }

    if (message.stop_reason === "max_tokens") {
      logger.error(
        `Response truncated at max_tokens. usage=${JSON.stringify(message.usage)} — bump max_tokens or trim input.`
      );
      throw new Error("Claude response truncated at max_tokens");
    }

    const output = toolUse.input as DigestOutput;
    const totalItems = output.themes.reduce(
      (sum, t) => sum + t.news.length + t.insights.length + t.actions.length,
      0
    );
    logger.info(
      `Analysis complete: ${totalItems} themed items, ${output.quickHits.length} quick hits, ${output.contentIdeas.length} content ideas`
    );
    return output;
  },
});
