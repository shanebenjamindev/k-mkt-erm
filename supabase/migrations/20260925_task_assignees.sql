-- Apply before deploying the multi-assignee task code. Existing assignments are kept.
begin;
alter table public.tasks add column if not exists assignee_ids uuid[] not null default '{}';
update public.tasks t set assignee_ids = array[m.id]
from public.team_members m
where t.owner_name = m.name and cardinality(t.assignee_ids) = 0;
create index if not exists tasks_assignee_ids_idx on public.tasks using gin (assignee_ids);
commit;
