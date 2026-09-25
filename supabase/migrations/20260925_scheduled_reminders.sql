begin;
alter table public.tasks add column if not exists reminder_date date;
alter table public.tasks add column if not exists reminder_time time;
alter table public.tasks add column if not exists reminder_repeat text not null default 'none';
alter table public.workspace_notifications add column if not exists scheduled_at timestamptz;
alter table public.workspace_notifications add column if not exists scheduled_repeat text not null default 'none';
create index if not exists workspace_notifications_scheduled_idx on public.workspace_notifications (scheduled_at) where scheduled_at is not null;
commit;
