-- K-MKT Workspace schema for Supabase Auth.
-- Create users with Supabase Auth; this file intentionally creates no accounts.

create table if not exists public.team_members (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null,
  work_type text not null check (work_type in ('inhouse', 'outsource')),
  username text not null unique,
  access_role text not null default 'employee' check (access_role in ('admin', 'employee')),
  avatar_url text,
  initials text not null,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  owner_name text not null default 'Chưa phân công',
  work_type text not null check (work_type in ('inhouse', 'outsource')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'pending_review', 'completed')),
  start_date date,
  deadline date,
  start_time time not null default '09:00',
  end_time time not null default '11:00',
  format text not null default '',
  brief text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_deadline_idx on public.tasks (deadline);
create index if not exists tasks_status_idx on public.tasks (status);

-- Safe for an existing workspace: task records created before ranges are one-day tasks.
alter table public.tasks add column if not exists start_date date;
update public.tasks set start_date = deadline where start_date is null and deadline is not null;
create index if not exists tasks_start_date_idx on public.tasks (start_date);
alter table public.tasks add column if not exists end_time time;
update public.tasks set end_time = '11:00' where end_time is null and start_time <= '09:00';
update public.tasks set end_time = '13:00' where end_time is null and start_time = '11:00';
update public.tasks set end_time = '15:00' where end_time is null and start_time = '13:00';
update public.tasks set end_time = '17:00' where end_time is null and start_time = '15:00';
update public.tasks set end_time = '19:00' where end_time is null;
alter table public.tasks alter column end_time set not null;

create table if not exists public.workspace_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.team_members(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  kind text not null check (kind in ('task_assigned', 'task_due', 'task_overdue')),
  title text not null,
  body text not null,
  event_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.team_members(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists workspace_notifications_user_created_idx on public.workspace_notifications (user_id, created_at desc);
create index if not exists workspace_notifications_task_idx on public.workspace_notifications (task_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;
alter table public.team_members enable row level security;
alter table public.workspace_notifications enable row level security;
alter table public.push_subscriptions enable row level security;

-- Add RLS policies tailored to your organization before exposing tables to clients.
-- Passwords are handled only by Supabase Auth (auth.users); never add a password
-- column to these application tables.
