
-- Table des exercices custom ajoutés par la coach
create table if not exists public.coach_exercises (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  created_by uuid not null,
  title text not null,
  description text,
  deadline date,
  app_route text,
  phase_id text not null default 'coach',
  sort_order int default 0,
  status text check (status in ('todo', 'in_progress', 'done')) default 'todo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.coach_exercises enable row level security;

create policy "Workspace members manage exercises" on public.coach_exercises for all using (
  public.user_has_workspace_access(workspace_id)
);

-- Table de visibilité des étapes du plan standard
create table if not exists public.plan_step_visibility (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  step_id text not null,
  hidden boolean default false,
  hidden_by uuid,
  updated_at timestamptz default now(),
  unique(workspace_id, step_id)
);

alter table public.plan_step_visibility enable row level security;

create policy "Workspace members manage visibility" on public.plan_step_visibility for all using (
  public.user_has_workspace_access(workspace_id)
);
