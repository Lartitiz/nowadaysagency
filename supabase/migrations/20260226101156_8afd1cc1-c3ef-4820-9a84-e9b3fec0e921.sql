
create table if not exists public.user_plan_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid,
  step_id text not null,
  manual_status text check (manual_status in ('done', 'undone')) not null,
  updated_at timestamptz default now(),
  unique(user_id, workspace_id, step_id)
);

alter table public.user_plan_overrides enable row level security;

create policy "Users manage own overrides" on public.user_plan_overrides for all using (auth.uid() = user_id);
