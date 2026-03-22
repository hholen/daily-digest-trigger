export interface CollectedItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
  sourceType: "news" | "youtube" | "newsletter" | "blog" | "reddit";
  publishedAt: string;
  meta?: string;
}

export interface DigestItem {
  text: string;
  url: string;
  headline?: boolean;
}

export interface DigestTheme {
  name: string;
  news: DigestItem[];
  insights: DigestItem[];
  actions: DigestItem[];
}

export interface ContentIdea {
  hook: string;
  angle: string;
  platform: string;
  sourceUrls: string[];
}

export interface DigestOutput {
  themes: DigestTheme[];
  quickHits: DigestItem[];
  contentIdeas: ContentIdea[];
}
