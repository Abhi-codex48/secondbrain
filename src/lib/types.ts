import type { KeyPoints } from "./keypoints";
export type { KeyPoints };

export interface Folder {
  id: string;
  name: string;
  color: string;
  sort: number;
  created_at: string;
}

import type { Page } from "./ink";
/** A handwriting page: strokes, shapes, text and images. */
export type InkPage = Page;

export interface Note {
  id: string;
  folder_id: string | null;
  kind: "note" | "article" | "ink";
  title: string;
  body_html: string;
  body_text: string;
  ink: InkPage[] | null;
  key_points: KeyPoints | null;
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
  /** Permanently deleted: content removed, kept as a marker so other devices remove it too. */
  purged?: boolean;
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
  /** Text you pasted for this article (private, stored in your account). */
  article_text: string | null;
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

/** Health of one newspaper in the latest hourly fetch. */
export interface Source {
  key: string;
  name: string;
  ok: boolean;
  count: number;
  fallback: boolean;
  /** Where headlines came from when the paper's own feeds didn't answer. */
  via?: string;
  /** Couldn't be reached this hour; its earlier headlines are still shown. */
  stale?: boolean;
  error?: string;
}

export interface NoteVersion {
  id: string;
  title: string | null;
  body_html: string | null;
  ink: InkPage[] | null;
  key_points: KeyPoints | null;
  created_at: string;
}
