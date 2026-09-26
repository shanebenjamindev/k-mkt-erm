alter table public.tasks add column if not exists linked_brief_ids uuid[] not null default '{}';
create index if not exists tasks_linked_brief_ids_idx on public.tasks using gin (linked_brief_ids);
