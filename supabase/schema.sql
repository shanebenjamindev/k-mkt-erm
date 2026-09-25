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
  assignee_ids uuid[] not null default '{}',
  work_type text not null check (work_type in ('inhouse', 'outsource')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'pending_review', 'completed')),
  start_date date,
  deadline date,
  start_time time not null default '09:00',
  end_time time not null default '11:00',
  reminder_date date,
  reminder_time time,
  reminder_repeat text not null default 'none' check (reminder_repeat in ('none', 'daily', 'weekly')),
  reminder_offsets integer[] not null default '{}',
  format text not null default '',
  brief text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_deadline_idx on public.tasks (deadline);
create index if not exists tasks_status_idx on public.tasks (status);

-- Existing single-owner tasks keep their assignment when enabling multiple people.
alter table public.tasks add column if not exists assignee_ids uuid[] not null default '{}';
update public.tasks t set assignee_ids = array[m.id]
from public.team_members m
where t.owner_name = m.name and cardinality(t.assignee_ids) = 0;
create index if not exists tasks_assignee_ids_idx on public.tasks using gin (assignee_ids);

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
alter table public.tasks add column if not exists reminder_date date;
alter table public.tasks add column if not exists reminder_time time;
alter table public.tasks add column if not exists reminder_repeat text not null default 'none';
alter table public.tasks add column if not exists reminder_offsets integer[] not null default '{}';

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

create table if not exists public.workspace_settings (
  id integer primary key default 1 check (id = 1),
  accent_color text not null default '#E53935',
  background_preset text not null default 'blush',
  background_image text,
  notification_tone text not null default 'chime',
  updated_at timestamptz not null default now()
);

create index if not exists workspace_notifications_user_created_idx on public.workspace_notifications (user_id, created_at desc);
create index if not exists workspace_notifications_task_idx on public.workspace_notifications (task_id);
-- Required for the per-notification reminder cooldown; safe on existing data.
alter table public.workspace_notifications add column if not exists reminded_at timestamptz;
alter table public.workspace_notifications add column if not exists scheduled_at timestamptz;
alter table public.workspace_notifications add column if not exists scheduled_repeat text not null default 'none';
create index if not exists workspace_notifications_scheduled_idx on public.workspace_notifications (scheduled_at) where scheduled_at is not null;
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
alter table public.workspace_settings enable row level security;

-- Fetch the visible feed and the total unread count from the same SQL snapshot.
-- The server authenticates p_user_id before calling this service-role-only RPC.
create or replace function public.get_workspace_notification_feed(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc, recent.id desc)
      from (
        select * from public.workspace_notifications
        where user_id = p_user_id
        order by created_at desc, id desc
        limit 40
      ) recent
    ), '[]'::jsonb),
    'unread_count', (
      select count(*) from public.workspace_notifications
      where user_id = p_user_id and read_at is null
    )
  );
$$;
revoke all on function public.get_workspace_notification_feed(uuid) from public, anon, authenticated;
grant execute on function public.get_workspace_notification_feed(uuid) to service_role;

-- Add RLS policies tailored to your organization before exposing tables to clients.
-- Passwords are handled only by Supabase Auth (auth.users); never add a password
-- column to these application tables.
