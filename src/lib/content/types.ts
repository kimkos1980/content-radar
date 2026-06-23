export type ContentSourceType = "youtube" | "google_news" | "rss" | "manual";

export type ContentItemStatus =
  | "new"
  | "approved"
  | "rejected"
  | "in_work"
  | "urgent"
  | "remake"
  | "used";

export type ContentSource = {
  id: string;
  type: ContentSourceType;
  name: string;
  url: string | null;
  query: string | null;
  language: string;
  enabled: boolean;
  created_at: string;
};

export type ContentKeyword = {
  id: string;
  keyword: string;
  language: string;
  category: string;
  weight: number;
  enabled: boolean;
};

export type ContentCandidate = {
  source_id: string | null;
  source_type: ContentSourceType;
  source_name: string;
  source_url: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  language: string | null;
  published_at: string | null;
};

export type ContentItem = ContentCandidate & {
  id: string;
  category: string | null;
  score: number;
  status: ContentItemStatus;
  found_at: string;
  editor_note: string | null;
};

export type CollectResult = {
  found: number;
  inserted: number;
  sent: number;
  skippedDuplicates: number;
  skippedStale: number;
  errors: Array<{
    source: string;
    message: string;
  }>;
};
