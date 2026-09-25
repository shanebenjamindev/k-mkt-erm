begin;
alter table public.tasks add column if not exists reminder_offsets integer[] not null default '{}';
commit;
