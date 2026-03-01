create table if not exists public.scrape_cache (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  source_type text not null default 'website',
  content text,
  created_at timestamptz default now(),
  unique(user_id, url)
);

alter table public.scrape_cache enable row level security;

create policy "Users can read own cache" on public.scrape_cache
  for select using (auth.uid() = user_id);

create policy "Users can insert own cache" on public.scrape_cache
  for insert with check (auth.uid() = user_id);