-- Extend the existing single-workspace settings row. This reuses the current
-- settings table instead of introducing a parallel project/settings schema.
alter table public.workspace_settings
  add column if not exists project_name text not null default 'K-MKT Workspace',
  add column if not exists project_description text not null default '',
  add column if not exists project_logo_url text not null default '',
  add column if not exists notification_events jsonb not null
    default '{"task_assigned":true,"task_due":true,"task_overdue":true}'::jsonb;

update public.workspace_settings
set notification_events = '{"task_assigned":true,"task_due":true,"task_overdue":true}'::jsonb
where notification_events is null;

alter table public.workspace_settings alter column notification_events set not null;
