create table public.dashboard_clicks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid not null,
  porte text not null check (porte in ('creer','programmer','photos')),
  created_at timestamptz not null default now()
);

create index dashboard_clicks_created_idx on public.dashboard_clicks (created_at);

grant select, insert on public.dashboard_clicks to authenticated;
grant all on public.dashboard_clicks to service_role;

alter table public.dashboard_clicks enable row level security;

create policy "insert own clicks" on public.dashboard_clicks
  for insert to authenticated with check (auth.uid() = user_id);

create policy "read own clicks" on public.dashboard_clicks
  for select to authenticated using (auth.uid() = user_id);