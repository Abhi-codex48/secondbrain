-- Second Brain: schema, row-level security and helpers.
-- Every table is private to its owner (user_id = auth.uid()).

create extension if not exists pg_trgm;

-- ---------- folders ----------
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default 'violet',
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists folders_user_name on public.folders (user_id, lower(name));

-- ---------- notes ----------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  folder_id uuid references public.folders on delete set null,
  kind text not null default 'note' check (kind in ('note', 'article', 'ink')),
  title text not null default '',
  body_html text not null default '',
  body_text text not null default '',
  ink jsonb,                                  -- handwriting pages: [{height, strokes:[...]}]
  ai_summary jsonb,                           -- AI draft, kept apart from body_html (my writing)
  source_url text,
  source_name text,
  source_published_at timestamptz,            -- null when the source gave no date
  news_item_id uuid,
  read_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  pinned boolean not null default false,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                      -- set = in Trash
);
create index if not exists notes_user_updated on public.notes (user_id, updated_at desc);
create index if not exists notes_user_read_on on public.notes (user_id, read_on desc);
create index if not exists notes_title_trgm on public.notes using gin (title gin_trgm_ops);
create index if not exists notes_text_trgm on public.notes using gin (body_text gin_trgm_ops);

-- Version history: the previous content is kept whenever text, handwriting or the AI draft changes.
create table if not exists public.note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  title text,
  body_html text,
  ink jsonb,
  ai_summary jsonb,
  created_at timestamptz not null default now()
);
create index if not exists note_versions_note on public.note_versions (note_id, created_at desc);

create or replace function public.notes_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if (old.body_html is distinct from new.body_html or old.title is distinct from new.title
      or old.ink is distinct from new.ink or old.ai_summary is distinct from new.ai_summary)
     and (old.body_html <> '' or old.ink is not null or old.ai_summary is not null)
     -- one snapshot per 10 minutes of continuous editing keeps history useful and small
     and not exists (select 1 from note_versions v where v.note_id = old.id and v.created_at > now() - interval '10 minutes') then
    insert into note_versions (note_id, user_id, title, body_html, ink, ai_summary)
    values (old.id, old.user_id, old.title, old.body_html, old.ink, old.ai_summary);
    delete from note_versions where id in (
      select id from note_versions where note_id = old.id order by created_at desc offset 30);
  end if;
  return new;
end $$;
drop trigger if exists notes_before_update on public.notes;
create trigger notes_before_update before update on public.notes
  for each row execute function public.notes_before_update();

-- ---------- to-do ----------
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  done boolean not null default false,
  done_at timestamptz,
  due_on date,
  created_at timestamptz not null default now()
);
create index if not exists todos_user on public.todos (user_id, created_at desc);

-- ---------- news ----------
create table if not exists public.sources (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  name text not null,
  site text not null,
  feeds text[] not null default '{}',
  enabled boolean not null default true,
  last_ok_at timestamptz,
  last_error text,
  last_count int,
  used_fallback boolean not null default false,
  primary key (user_id, key)
);

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  url text not null,
  title text not null,
  description text not null default '',
  source_key text not null,
  source_name text not null,
  published_at timestamptz,                   -- null = the feed gave no date
  fetched_at timestamptz not null default now(),
  topics text[] not null default '{}',
  content_level text not null default 'headline' check (content_level in ('headline', 'excerpt', 'full')),
  article_text text,
  summaries jsonb not null default '{}',      -- {"short": {...}, "detailed": {...}}
  status text not null default 'new' check (status in ('new', 'read', 'saved', 'dismissed')),
  read_at timestamptz,
  unique (user_id, url)
);
create index if not exists news_user_fetched on public.news_items (user_id, fetched_at desc);
create index if not exists news_title_trgm on public.news_items using gin (title gin_trgm_ops);

create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  last_news_sync timestamptz,
  ai_day date,
  ai_count int not null default 0
);

-- ---------- row-level security ----------
do $$
declare t text;
begin
  foreach t in array array['folders', 'notes', 'note_versions', 'todos', 'sources', 'news_items', 'user_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('create policy owner_all on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------- attachments (images in notes) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "own attachments read" on storage.objects;
drop policy if exists "own attachments write" on storage.objects;
drop policy if exists "own attachments delete" on storage.objects;
create policy "own attachments read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own attachments write" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own attachments delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- storage usage (for Settings) ----------
create or replace function public.storage_usage() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'notes_bytes', coalesce((select sum(pg_column_size(n.*)) from notes n where user_id = auth.uid() and deleted_at is null), 0),
    'trash_bytes', coalesce((select sum(pg_column_size(n.*)) from notes n where user_id = auth.uid() and deleted_at is not null), 0),
    'versions_bytes', coalesce((select sum(pg_column_size(v.*)) from note_versions v where user_id = auth.uid()), 0),
    'news_bytes', coalesce((select sum(pg_column_size(x.*)) from news_items x where user_id = auth.uid()), 0),
    'news_count', (select count(*) from news_items where user_id = auth.uid()),
    'notes_count', (select count(*) from notes where user_id = auth.uid() and deleted_at is null),
    'trash_count', (select count(*) from notes where user_id = auth.uid() and deleted_at is not null),
    'files_bytes', coalesce((select sum((metadata->>'size')::bigint) from storage.objects
                     where bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text), 0),
    'files_count', (select count(*) from storage.objects
                     where bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  );
$$;

-- Counts one AI call for today (Asia/Kolkata) and returns the new count.
create or replace function public.bump_ai_count() returns int
language plpgsql security invoker set search_path = public as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date; c int;
begin
  insert into user_settings (user_id, ai_day, ai_count) values (auth.uid(), today, 1)
  on conflict (user_id) do update
    set ai_count = case when user_settings.ai_day = today then user_settings.ai_count + 1 else 1 end,
        ai_day = today
  returning ai_count into c;
  return c;
end $$;
