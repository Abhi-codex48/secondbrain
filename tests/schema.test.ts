import { describe, expect, it, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";
import path from "node:path";

// Runs the real migration on an in-memory Postgres with minimal stand-ins for
// Supabase's auth and storage schemas, then checks row-level security and triggers.
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
let db: PGlite;
const checks: [string, boolean][] = [];
const ok = (c: boolean, m: string) => checks.push([m, c]);

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  // Minimal stand-ins for Supabase's auth and storage schemas.
await db.exec(`
create role authenticated nologin;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
insert into auth.users values ('${A}'), ('${B}');
`);
  const dir = path.join(__dirname, "../supabase/migrations");
  for (const f of fs.readdirSync(dir).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  await db.exec(`grant usage on schema public, auth, storage to authenticated; grant all on all tables in schema public to authenticated; grant select on storage.objects to authenticated; grant execute on all functions in schema public, auth to authenticated;`);
  const as = async (uid: string, sql: string): Promise<any> => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`); try { return await db.query(sql); } finally { await db.exec("reset role;"); } };

await as(A, `insert into folders (name) values ('Polity')`);
const f = (await as(A, `select id from folders`)).rows[0].id;
await as(A, `insert into notes (id, folder_id, title, body_html, body_text) values ('aaaaaaaa-0000-0000-0000-000000000001', '${f}', 'Note A', '<p>v1</p>', 'v1')`);
ok((await as(B, `select * from notes`)).rows.length === 0, "user B cannot see user A's notes");
ok((await as(B, `select * from folders`)).rows.length === 0, "user B cannot see user A's folders");
let err: unknown = null; try { await as(B, `update notes set title='hack' where id='aaaaaaaa-0000-0000-0000-000000000001'`); } catch (e) { err = e; }
ok((await as(A, `select title from notes`)).rows[0].title === "Note A", "user B cannot change user A's note");
err = null; try { await as(B, `insert into notes (user_id, title) values ('${A}', 'spoof')`); } catch (e) { err = e; }
ok(err !== null, "user B cannot insert rows owned by user A");
await as(A, `update notes set body_html='<p>v2</p>' where title='Note A'`);
ok((await as(A, `select body_html from note_versions`)).rows[0]?.body_html === "<p>v1</p>", "editing keeps the previous text in history");
await as(A, `update notes set body_html='<p>v3</p>' where title='Note A'`);
ok((await as(A, `select count(*)::int n from note_versions`)).rows[0].n === 1, "rapid edits within 10 minutes create one snapshot");
ok((await as(A, `select read_on from notes`)).rows[0].read_on !== null, "read_on defaults to today (IST)");
await as(A, `insert into news_items (url, title, source_key, source_name) values ('https://x.com/a', 'T', 'k', 'K') on conflict (user_id, url) do nothing`);
await as(A, `insert into news_items (url, title, source_key, source_name) values ('https://x.com/a', 'T2', 'k', 'K') on conflict (user_id, url) do nothing`);
ok((await as(A, `select count(*)::int n from news_items`)).rows[0].n === 1, "duplicate news URL is stored once");
ok((await as(A, `select published_at from news_items`)).rows[0].published_at === null, "unknown publication date stays empty");
await as(B, `insert into news_items (url, title, source_key, source_name) values ('https://x.com/a', 'T', 'k', 'K')`);
ok((await as(B, `select count(*)::int n from news_items`)).rows[0].n === 1, "another user can save the same URL separately");
ok((await as(A, `select bump_ai_count() n`)).rows[0].n === 1 && (await as(A, `select bump_ai_count() n`)).rows[0].n === 2, "AI counter increments");
const u = (await as(A, `select storage_usage() u`)).rows[0].u;
ok(u.notes_count === 1 && u.news_count === 1, "storage usage counts only the user's own rows");
await as(A, `update notes set deleted_at = now()`);
ok((await as(A, `select storage_usage() u`)).rows[0].u.trash_count === 1, "trashed note is counted in Trash and recoverable");
await as(A, `delete from folders where id='${f}'`);
ok((await as(A, `select folder_id from notes`)).rows[0].folder_id === null, "deleting a folder keeps its notes (moved to Unfiled)");
}, 60000);

describe("database schema", () => {
  it("passes every security and behaviour check", () => {
    const failed = checks.filter(([, c]) => !c).map(([m]) => m);
    expect(checks.length).toBeGreaterThan(10);
    expect(failed).toEqual([]);
  });
});
