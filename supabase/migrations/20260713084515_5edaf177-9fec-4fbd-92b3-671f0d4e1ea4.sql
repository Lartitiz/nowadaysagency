create table if not exists public.content_quality_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid,
  format text not null,
  model text,
  redac_score integer,
  redac_violations integer,
  redac_repassed boolean default false,
  created_at timestamptz not null default now()
);

grant all on public.content_quality_events to service_role;

alter table public.content_quality_events enable row level security;

create policy "content_quality admin read" on public.content_quality_events
  for select using (public.has_role(auth.uid(), 'admin'));

create index if not exists idx_content_quality_created
  on public.content_quality_events (created_at);