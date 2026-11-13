-- Sasyna online research workspace.
-- Adds one isolated table; existing accounts, orders, payments, and profile data are untouched.

create table if not exists public.research_projects (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete restrict,
  title text not null,
  project_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'generating', 'ready', 'failed')),
  completed_sections integer not null default 0 check (completed_sections >= 0),
  total_sections integer not null default 0 check (total_sections >= 0),
  current_section text,
  generation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_projects_student_updated_idx
  on public.research_projects (student_id, updated_at desc);

alter table public.research_projects enable row level security;

drop policy if exists "Students can read their research projects" on public.research_projects;
create policy "Students can read their research projects"
  on public.research_projects for select to authenticated
  using (auth.uid() = student_id);

drop policy if exists "Students can create their research projects" on public.research_projects;
create policy "Students can create their research projects"
  on public.research_projects for insert to authenticated
  with check (auth.uid() = student_id);

drop policy if exists "Students can update their research projects" on public.research_projects;
create policy "Students can update their research projects"
  on public.research_projects for update to authenticated
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

grant select, insert, update on public.research_projects to authenticated;
grant all on public.research_projects to service_role;
