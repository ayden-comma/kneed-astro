-- Production's profiles + comments setup as read on 2026-10-09 (layered on replica.sql).
alter table public.profiles
  add column if not exists username text, add column if not exists avatar_url text, add column if not exists bio text,
  add column if not exists created_at timestamptz default now(), add column if not exists date_of_birth date,
  add column if not exists gender text, add column if not exists location text,
  add column if not exists demographics_consent boolean default false, add column if not exists demographics_consent_at timestamptz,
  add column if not exists newsletter_prompted_at timestamptz, add column if not exists deleted_at timestamptz;
update public.profiles set username = lower(display_name);
drop policy if exists "Own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "Admins can read all profiles" on public.profiles for select to authenticated using (public.is_admin());
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);
grant select, update, references, trigger, truncate on public.profiles to authenticated;   -- as production
grant references, trigger, truncate on public.profiles to anon;

create table public.comments (
  id uuid primary key default gen_random_uuid(), user_id uuid, bakery_slug text, content text,
  created_at timestamptz default now(), parent_comment_id uuid);
alter table public.comments enable row level security;
create policy "read" on public.comments for select using (true);
create policy "insert own" on public.comments for insert with check (auth.uid() = user_id);
create policy "delete own" on public.comments for delete using (auth.uid() = user_id);
grant select, insert, delete, references, trigger, truncate on public.comments to authenticated;
grant select, references, trigger, truncate on public.comments to anon;
grant all on public.comments to service_role;
