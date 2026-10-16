export interface Folder {
  id: string;
  name: string;
  color: string;
  sort: number;
  created_at: string;
}

export interface Stroke {
  /** [x, y, pressure] in a 1000-unit-wide coordinate space */
  points: [number, number, number][];
  color: string;
  size: number;
  tool: "pen" | "highlighter";
}

export interface InkPage {
  id?: string;
  height: number;
  strokes: Stroke[];
}

export interface Summary {
  in_short: string;
  what_happened: string[];
  why_it_matters: string[];
  key_facts: string[];
  upsc_papers: string[];
  mains_angle: string[];
  prelims_points: string[];
  read_further: string[];
  based_on: "full" | "excerpt" | "pasted" | "note";
  provider?: string;
  model?: string;
  created_at?: string;
}

export interface Note {
  id: string;
  folder_id: string | null;
  kind: "note" | "article" | "ink";
  title: string;
  body_html: string;
  body_text: string;
  ink: InkPage[] | null;
  ai_summary: Summary | null;
  source_url: string | null;
  source_name: string | null;
  source_published_at: string | null;
  news_item_id: string | null;
  read_on: string;
  pinned: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface NewsItem {
  id: string;
  url: string;
  title: string;
  description: string;
  source_key: string;
  source_name: string;
  published_at: string | null;
  fetched_at: string;
  topics: string[];
  content_level: "headline" | "excerpt" | "full";
  article_text: string | null;
  summaries: Partial<Record<"short" | "detailed", Summary>>;
  status: "new" | "read" | "saved" | "dismissed";
  read_at: string | null;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  done_at: string | null;
  due_on: string | null;
  created_at: string;
}

export interface Source {
  key: string;
  name: string;
  site: string;
  feeds: string[];
  enabled: boolean;
  last_ok_at: string | null;
  last_error: string | null;
  last_count: number | null;
  used_fallback: boolean;
}

export interface NoteVersion {
  id: string;
  title: string | null;
  body_html: string | null;
  ink: InkPage[] | null;
  ai_summary: Summary | null;
  created_at: string;
}
