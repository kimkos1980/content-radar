import "server-only";
import Parser from "rss-parser";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { scoreCandidate } from "./scoring";
import { notifyTelegram } from "./telegramNotifier";
import type {
  CollectResult,
  ContentCandidate,
  ContentItem,
  ContentKeyword,
  ContentSource
} from "./types";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "user-agent": "content-radar/0.1"
  }
});

const FRESHNESS_WINDOW_HOURS = 6;
const FRESHNESS_WINDOW_MS = FRESHNESS_WINDOW_HOURS * 60 * 60 * 1000;

function normalizeUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value.trim();
  }
}

function isFreshCandidate(candidate: ContentCandidate, now = Date.now()) {
  if (!candidate.published_at) {
    return false;
  }

  const publishedAt = Date.parse(candidate.published_at);
  if (Number.isNaN(publishedAt)) {
    return false;
  }

  return publishedAt >= now - FRESHNESS_WINDOW_MS;
}

function googleNewsRssUrl(source: ContentSource) {
  if (source.url) {
    return source.url;
  }

  const query = source.query?.trim();
  if (!query) {
    throw new Error("Google News source requires url or query");
  }

  const params = new URLSearchParams({
    q: query,
    hl: source.language || "ru",
    gl: "RU",
    ceid: `RU:${source.language || "ru"}`
  });

  return `https://news.google.com/rss/search?${params.toString()}`;
}

async function collectYoutube(source: ContentSource): Promise<ContentCandidate[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const query = source.query?.trim();

  if (!apiKey) {
    throw new Error("Missing YOUTUBE_API_KEY");
  }

  if (!query) {
    throw new Error("YouTube source requires query");
  }

  const params = new URLSearchParams({
    key: apiKey,
    part: "snippet",
    type: "video",
    q: query,
    maxResults: "10",
    order: "date",
    safeSearch: "moderate",
    relevanceLanguage: source.language || "ru"
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    { next: { revalidate: 0 } }
  );

  if (!response.ok) {
    throw new Error(`YouTube search failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        description?: string;
        publishedAt?: string;
        thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
      };
    }>;
  };

  return (body.items ?? [])
    .map((item) => {
      const videoId = item.id?.videoId;
      const snippet = item.snippet;
      const sourceUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;

      if (!sourceUrl || !snippet?.title) {
        return null;
      }

      return {
        source_id: source.id,
        source_type: source.type,
        source_name: source.name,
        source_url: sourceUrl,
        title: snippet.title,
        description: snippet.description ?? null,
        thumbnail_url: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? null,
        language: source.language,
        published_at: snippet.publishedAt ?? null
      } satisfies ContentCandidate;
    })
    .filter(Boolean) as ContentCandidate[];
}

async function collectRss(source: ContentSource): Promise<ContentCandidate[]> {
  const rssUrl = source.type === "google_news" ? googleNewsRssUrl(source) : source.url;

  if (!rssUrl) {
    throw new Error("RSS source requires url");
  }

  const feed = await parser.parseURL(rssUrl);

  return feed.items
    .map((item) => {
      const sourceUrl = normalizeUrl(item.link);

      if (!sourceUrl || !item.title) {
        return null;
      }

      return {
        source_id: source.id,
        source_type: source.type,
        source_name: source.name,
        source_url: sourceUrl,
        title: item.title,
        description: item.contentSnippet ?? item.content ?? null,
        thumbnail_url: null,
        language: source.language,
        published_at: item.isoDate ?? item.pubDate ?? null
      } satisfies ContentCandidate;
    })
    .filter(Boolean) as ContentCandidate[];
}

async function collectForSource(source: ContentSource) {
  if (source.type === "youtube") {
    return collectYoutube(source);
  }

  if (source.type === "google_news" || source.type === "rss") {
    return collectRss(source);
  }

  return [];
}

function selectKeywordsForLanguage(
  keywords: ContentKeyword[],
  language: string | null | undefined
) {
  return keywords.filter(
    (keyword) => !language || keyword.language === language || keyword.language === "all"
  );
}

export async function collectContent(): Promise<CollectResult> {
  const supabase = getSupabaseAdmin();
  const result: CollectResult = {
    found: 0,
    inserted: 0,
    sent: 0,
    skippedDuplicates: 0,
    skippedStale: 0,
    errors: []
  };

  const [sourcesResponse, keywordsResponse] = await Promise.all([
    supabase
      .from("content_sources")
      .select("*")
      .eq("enabled", true)
      .returns<ContentSource[]>(),
    supabase
      .from("content_keywords")
      .select("*")
      .eq("enabled", true)
      .returns<ContentKeyword[]>()
  ]);

  if (sourcesResponse.error) {
    throw sourcesResponse.error;
  }

  if (keywordsResponse.error) {
    throw keywordsResponse.error;
  }

  const keywords = keywordsResponse.data ?? [];

  for (const source of sourcesResponse.data ?? []) {
    try {
      const candidates = await collectForSource(source);
      result.found += candidates.length;

      for (const candidate of candidates) {
        if (!isFreshCandidate(candidate)) {
          result.skippedStale += 1;
          continue;
        }

        const { data: existing, error: existingError } = await supabase
          .from("content_items")
          .select("id")
          .eq("source_url", candidate.source_url)
          .maybeSingle();

        if (existingError) {
          throw existingError;
        }

        if (existing) {
          result.skippedDuplicates += 1;
          continue;
        }

        const scoring = scoreCandidate(
          candidate,
          selectKeywordsForLanguage(keywords, candidate.language)
        );

        const { data: inserted, error: insertError } = await supabase
          .from("content_items")
          .insert({
            ...candidate,
            category: scoring.category,
            score: scoring.score,
            status: "new"
          })
          .select("*")
          .single<ContentItem>();

        if (insertError) {
          if (insertError.code === "23505") {
            result.skippedDuplicates += 1;
            continue;
          }

          throw insertError;
        }

        result.inserted += 1;

        if (inserted.score >= 10) {
          await notifyTelegram(inserted);
          result.sent += 1;
        }
      }
    } catch (error) {
      result.errors.push({
        source: source.name,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return result;
}

export async function saveManualContentItem(sourceUrl: string) {
  const supabase = getSupabaseAdmin();
  const normalizedUrl = normalizeUrl(sourceUrl);

  if (!normalizedUrl) {
    throw new Error("Invalid manual URL");
  }

  const { data: keywords, error: keywordsError } = await supabase
    .from("content_keywords")
    .select("*")
    .eq("enabled", true)
    .returns<ContentKeyword[]>();

  if (keywordsError) {
    throw keywordsError;
  }

  const candidate: ContentCandidate = {
    source_id: null,
    source_type: "manual",
    source_name: "Telegram manual",
    source_url: normalizedUrl,
    title: normalizedUrl,
    description: "Ссылка вручную отправлена в Telegram-бота.",
    thumbnail_url: null,
    language: "ru",
    published_at: null
  };

  const scoring = scoreCandidate(candidate, keywords ?? []);

  const { data, error } = await supabase
    .from("content_items")
    .upsert(
      {
        ...candidate,
        category: scoring.category ?? "manual",
        score: scoring.score,
        status: "new"
      },
      {
        onConflict: "source_url",
        ignoreDuplicates: true
      }
    )
    .select("*")
    .maybeSingle<ContentItem>();

  if (error) {
    throw error;
  }

  return data;
}
