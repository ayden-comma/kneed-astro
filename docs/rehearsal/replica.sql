-- Replica of the live (K)Need CMS schema as read from production on 2026-10-09.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login noinherit;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;


-- Supabase auth shim: auth.uid() reads the JWT subject PostgREST puts in request.jwt.claims.
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;

create table public.profiles (id uuid primary key, role text default 'member', display_name text);
alter table public.profiles enable row level security;
create policy "Own profile" on public.profiles for select using (id = auth.uid());
grant select on public.profiles to anon, authenticated;
insert into public.profiles (id, role, display_name) values
  ('00000000-0000-0000-0000-00000000aaaa', 'admin', 'Ayden'),
  ('00000000-0000-0000-0000-00000000bbbb', 'member', 'Member');

-- Same shape as production's is_admin(): SQL, STABLE, SECURITY DEFINER, search_path pinned.
create function public.is_admin() returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create function public.set_updated_at() returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end $$;

create table public.bakeries_cms (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text not null, category text not null,
  suburb text, address text, lat numeric, lng numeric, hours text, website text, instagram text,
  description text, thumbnail text, published boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  quote text, date text, body text, images jsonb, locations jsonb,
  director text, camera text, sound text, edit text, video_id text, map_link text, duration text,
  hero_title text, hero_subtitle text, hero_tag text, hero_bg_word text, hero_image_url text,
  episode_number integer, credits jsonb, loop_video_url text, published_at timestamptz,
  announced_at timestamptz, email_image_url text
);

create table public.articles_cms (
  id uuid primary key default gen_random_uuid(),
  title text not null, slug text not null, category text, description text, content text,
  thumbnail text, published boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  quote text, date text, body text, images jsonb, locations jsonb,
  director text, camera text, sound text, edit text, video_id text, map_link text, duration text,
  suburb text, address text, hours text, website text, instagram text, lat numeric, lng numeric,
  hero_tag text, hero_title text, hero_subtitle text, hero_bg_word text, hero_image_url text,
  credits jsonb, bakery_slug text, episode_number integer, published_at timestamptz
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  bakery_slug text, label text, address text, lat numeric, lng numeric, hours text,
  sort_order integer, created_at timestamptz default now(), place_id text, article_slug text
);

create trigger trg_bakeries_updated_at before update on public.bakeries_cms
  for each row execute function public.set_updated_at();
create trigger trg_articles_updated_at before update on public.articles_cms
  for each row execute function public.set_updated_at();

alter table public.bakeries_cms enable row level security;
alter table public.articles_cms enable row level security;
alter table public.locations enable row level security;
create policy "Public read" on public.bakeries_cms for select using (true);
create policy "Public read" on public.articles_cms for select using (true);
create policy "Public read" on public.locations for select using (true);
create policy "Authenticated write" on public.locations for all to authenticated using (true) with check (true);
create policy "Service role write" on public.locations for all to service_role using (true) with check (true);

grant all on public.bakeries_cms, public.articles_cms to anon, authenticated;
grant select, truncate, references, trigger on public.locations to anon, authenticated;
grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- Seed: 8 bakeries (4 published), 1 published article, locations.
insert into public.bakeries_cms (name, slug, category, published, published_at, hero_title, body, episode_number, updated_at)
select 'Bakery ' || i, 'bakery-' || i, 'Sourdough', i <= 4, case when i <= 4 then now() - interval '30 days' end,
       'Hero ' || i, '<p>Body ' || i || '</p>', i, now() - interval '10 days'
from generate_series(1, 8) i;
insert into public.articles_cms (title, slug, category, published, published_at, body, updated_at)
values ('Article One', 'article-one', 'Guide', true, now() - interval '20 days', '<p>Article body</p>', now() - interval '5 days');
insert into public.locations (bakery_slug, label, address, lat, lng, sort_order)
select 'bakery-' || i, 'Shop ' || i, i || ' Bread St', -37.8, 144.9, 0 from generate_series(1, 8) i;
insert into public.locations (bakery_slug, label, address, lat, lng, sort_order)
values ('bakery-1', 'Second shop', '2 Crust Ln', -37.81, 144.95, 1);
insert into public.locations (article_slug, label, address, sort_order) values ('article-one', 'Article spot', '9 Rye Rd', 0);
