-- ============================================================
--  SoundWave — Supabase Database Schema
--  Run this entire file in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";   -- for fuzzy search

-- ============================================================
--  ENUMS
-- ============================================================
create type user_role as enum ('admin', 'user');
create type plan_type as enum ('free', 'pro', 'admin');

-- ============================================================
--  TABLE: profiles
--  One row per authenticated user (auto-created via trigger)
-- ============================================================
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text unique not null,
  display_name    text,
  avatar_url      text,
  role            user_role not null default 'user',
  plan            plan_type not null default 'free',
  storage_used    bigint not null default 0,       -- bytes used in Storage
  storage_limit   bigint not null default 1073741824, -- 1 GB default
  is_banned       boolean not null default false,
  ban_reason      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_seen_at    timestamptz
);

-- ── Trigger: auto-create profile on new user signup ──────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Trigger: update updated_at automatically ─────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
--  TABLE: songs
-- ============================================================
create table if not exists public.songs (
  id              text primary key,               -- client-generated nanoid
  user_id         uuid not null references public.profiles(id) on delete cascade,
  title           text not null,
  artist          text not null default 'Unknown Artist',
  album           text not null default 'Unknown Album',
  genre           text,
  duration        numeric(10,3) not null default 0,  -- seconds
  file_size       bigint not null default 0,          -- bytes
  file_path       text,                               -- storage path
  cover_path      text,                               -- storage cover path
  has_cover       boolean not null default false,
  liked           boolean not null default false,
  play_count      integer not null default 0,
  last_played_at  timestamptz,
  is_public       boolean not null default false,   -- admin can make songs public
  added_at        timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index songs_user_id_idx on public.songs(user_id);
create index songs_liked_idx   on public.songs(user_id, liked) where liked = true;
create index songs_title_trgm  on public.songs using gin(title gin_trgm_ops);
create index songs_artist_trgm on public.songs using gin(artist gin_trgm_ops);

create trigger songs_updated_at
  before update on public.songs
  for each row execute function public.set_updated_at();

-- ============================================================
--  TABLE: playlists
-- ============================================================
create table if not exists public.playlists (
  id              text primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  name            text not null,
  description     text default '',
  cover_path      text,
  is_public       boolean not null default false,
  song_ids        text[] not null default '{}',
  song_count      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index playlists_user_id_idx on public.playlists(user_id);

create trigger playlists_updated_at
  before update on public.playlists
  for each row execute function public.set_updated_at();

-- ── Auto-update song_count ────────────────────────────────────
create or replace function public.sync_playlist_count()
returns trigger language plpgsql as $$
begin
  new.song_count = array_length(new.song_ids, 1);
  if new.song_count is null then new.song_count = 0; end if;
  return new;
end;
$$;

create trigger playlists_song_count
  before insert or update on public.playlists
  for each row execute function public.sync_playlist_count();

-- ============================================================
--  TABLE: play_history
-- ============================================================
create table if not exists public.play_history (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  song_id     text not null references public.songs(id) on delete cascade,
  played_at   timestamptz not null default now(),
  duration_played numeric(10,3)   -- how many seconds actually listened
);

create index play_history_user_idx on public.play_history(user_id, played_at desc);
create index play_history_song_idx on public.play_history(song_id);

-- ============================================================
--  TABLE: admin_logs  (audit trail for admin actions)
-- ============================================================
create table if not exists public.admin_logs (
  id          bigserial primary key,
  admin_id    uuid not null references public.profiles(id) on delete set null,
  action      text not null,       -- 'ban_user','delete_song','change_role', etc.
  target_type text,                -- 'user','song','playlist'
  target_id   text,
  details     jsonb default '{}',
  created_at  timestamptz not null default now()
);

create index admin_logs_admin_idx  on public.admin_logs(admin_id);
create index admin_logs_created_idx on public.admin_logs(created_at desc);

-- ============================================================
--  TABLE: app_settings  (global config, admin-controlled)
-- ============================================================
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);

-- Default settings
insert into public.app_settings (key, value) values
  ('allow_registration',  'true'),
  ('default_storage_gb',  '1'),
  ('max_file_size_mb',    '50'),
  ('allowed_formats',     '["mp3","wav","flac","m4a","ogg","aac","opus"]'),
  ('maintenance_mode',    'false'),
  ('app_name',            '"SoundWave"')
on conflict (key) do nothing;

-- ============================================================
--  STORAGE BUCKETS
--  Run these in Supabase Dashboard → Storage → New Bucket
--  OR run via API. Listed here for reference.
-- ============================================================
-- Bucket: "audio"   — private, per-user audio files
-- Bucket: "covers"  — public (for sharing), cover art images
--
-- After creating buckets, set these policies in Storage → Policies:
-- audio bucket: authenticated users can upload/read their own files
-- covers bucket: public read, authenticated write own files

-- ============================================================
--  ROW LEVEL SECURITY (RLS)
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "profiles: own read"
  on public.profiles for select
  using (auth.uid() = id);

-- Admins can read all profiles
create policy "profiles: admin read all"
  on public.profiles for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Users can update their own non-privileged fields
create policy "profiles: own update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- prevent self-promotion to admin
    and (role = (select role from public.profiles where id = auth.uid()))
  );

-- Admins can update any profile
create policy "profiles: admin update all"
  on public.profiles for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── songs ─────────────────────────────────────────────────────
alter table public.songs enable row level security;

create policy "songs: own read"
  on public.songs for select
  using (auth.uid() = user_id or is_public = true);

create policy "songs: admin read all"
  on public.songs for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "songs: own insert"
  on public.songs for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_banned = true
    )
  );

create policy "songs: own update"
  on public.songs for update
  using (auth.uid() = user_id);

create policy "songs: own delete"
  on public.songs for delete
  using (auth.uid() = user_id);

create policy "songs: admin delete any"
  on public.songs for delete
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── playlists ─────────────────────────────────────────────────
alter table public.playlists enable row level security;

create policy "playlists: own or public read"
  on public.playlists for select
  using (auth.uid() = user_id or is_public = true);

create policy "playlists: admin read all"
  on public.playlists for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "playlists: own insert"
  on public.playlists for insert
  with check (auth.uid() = user_id);

create policy "playlists: own update"
  on public.playlists for update
  using (auth.uid() = user_id);

create policy "playlists: own delete"
  on public.playlists for delete
  using (auth.uid() = user_id);

-- ── play_history ──────────────────────────────────────────────
alter table public.play_history enable row level security;

create policy "play_history: own read"
  on public.play_history for select
  using (auth.uid() = user_id);

create policy "play_history: admin read all"
  on public.play_history for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "play_history: own insert"
  on public.play_history for insert
  with check (auth.uid() = user_id);

-- ── admin_logs ────────────────────────────────────────────────
alter table public.admin_logs enable row level security;

create policy "admin_logs: admin only"
  on public.admin_logs for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── app_settings ──────────────────────────────────────────────
alter table public.app_settings enable row level security;

create policy "app_settings: all can read"
  on public.app_settings for select
  using (true);

create policy "app_settings: admin write"
  on public.app_settings for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ============================================================
--  HELPER FUNCTIONS
-- ============================================================

-- Get current user's role (used in policies)
create or replace function public.get_my_role()
returns user_role language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Check if current user is admin
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Record a play (increments play_count, inserts history)
create or replace function public.record_play(song_id text, duration_played numeric default 0)
returns void language plpgsql security definer as $$
begin
  update public.songs
  set play_count = play_count + 1, last_played_at = now()
  where id = song_id and user_id = auth.uid();

  insert into public.play_history (user_id, song_id, duration_played)
  values (auth.uid(), song_id, duration_played);
end;
$$;

-- Update storage usage for a user
create or replace function public.update_storage_used(user_id uuid, delta bigint)
returns void language plpgsql security definer as $$
begin
  update public.profiles
  set storage_used = greatest(0, storage_used + delta)
  where id = user_id;
end;
$$;

-- Admin: ban a user
create or replace function public.admin_ban_user(target_id uuid, reason text)
returns void language plpgsql security definer as $$
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  update public.profiles set is_banned = true, ban_reason = reason where id = target_id;
  insert into public.admin_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'ban_user', 'user', target_id::text, jsonb_build_object('reason', reason));
end;
$$;

-- Admin: unban a user
create or replace function public.admin_unban_user(target_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  update public.profiles set is_banned = false, ban_reason = null where id = target_id;
  insert into public.admin_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'unban_user', 'user', target_id::text, '{}');
end;
$$;

-- Admin: change user role
create or replace function public.admin_set_role(target_id uuid, new_role user_role)
returns void language plpgsql security definer as $$
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  update public.profiles set role = new_role where id = target_id;
  insert into public.admin_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'change_role', 'user', target_id::text, jsonb_build_object('new_role', new_role));
end;
$$;

-- Admin: delete any song
create or replace function public.admin_delete_song(song_id text)
returns void language plpgsql security definer as $$
declare song_owner uuid;
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  select user_id into song_owner from public.songs where id = song_id;
  delete from public.songs where id = song_id;
  insert into public.admin_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'delete_song', 'song', song_id, jsonb_build_object('owner_id', song_owner));
end;
$$;

-- Admin: get platform stats
create or replace function public.admin_get_stats()
returns jsonb language plpgsql security definer as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Unauthorized'; end if;
  select jsonb_build_object(
    'total_users',     (select count(*) from public.profiles),
    'total_songs',     (select count(*) from public.songs),
    'total_playlists', (select count(*) from public.playlists),
    'total_plays',     (select count(*) from public.play_history),
    'banned_users',    (select count(*) from public.profiles where is_banned = true),
    'storage_used_gb', (select round(sum(storage_used)::numeric / 1073741824, 2) from public.profiles),
    'new_users_today', (select count(*) from public.profiles where created_at >= now() - interval '1 day'),
    'plays_today',     (select count(*) from public.play_history where played_at >= now() - interval '1 day')
  ) into result;
  return result;
end;
$$;

-- ============================================================
--  STORAGE POLICIES (run in Supabase Storage → Policies)
-- ============================================================
-- Execute after creating "audio" and "covers" buckets:

-- Audio bucket: users manage their own files
-- insert into storage.buckets (id, name, public) values ('audio', 'audio', false);
-- insert into storage.buckets (id, name, public) values ('covers', 'covers', true);

create policy "audio: own upload"
  on storage.objects for insert
  with check (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "audio: own read"
  on storage.objects for select
  using (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "audio: admin read all"
  on storage.objects for select
  using (bucket_id = 'audio' and public.is_admin());

create policy "audio: own delete"
  on storage.objects for delete
  using (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "covers: public read"
  on storage.objects for select
  using (bucket_id = 'covers');

create policy "covers: own upload"
  on storage.objects for insert
  with check (bucket_id = 'covers' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "covers: own delete"
  on storage.objects for delete
  using (bucket_id = 'covers' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
--  CREATE FIRST ADMIN USER
--  After signing up normally, run this in SQL Editor
--  replacing 'your@email.com' with your email:
-- ============================================================
-- update public.profiles
-- set role = 'admin', plan = 'admin', storage_limit = 107374182400  -- 100GB
-- where email = 'your@email.com';

-- ============================================================
--  USEFUL QUERIES FOR REFERENCE
-- ============================================================

-- Get all users with stats:
-- select p.id, p.email, p.display_name, p.role, p.plan, p.is_banned,
--        p.storage_used / 1048576 as storage_mb,
--        count(s.id) as song_count,
--        p.created_at
-- from public.profiles p
-- left join public.songs s on s.user_id = p.id
-- group by p.id order by p.created_at desc;

-- Top songs by play count:
-- select s.title, s.artist, s.play_count, p.email as owner
-- from public.songs s join public.profiles p on p.id = s.user_id
-- order by s.play_count desc limit 20;

-- Storage usage per user:
-- select email, display_name,
--        round(storage_used::numeric/1073741824, 3) as used_gb,
--        round(storage_limit::numeric/1073741824, 0) as limit_gb
-- from public.profiles order by storage_used desc;

-- Recent admin actions:
-- select al.created_at, p.email as admin_email, al.action, al.target_type, al.target_id, al.details
-- from public.admin_logs al join public.profiles p on p.id = al.admin_id
-- order by al.created_at desc limit 50;
