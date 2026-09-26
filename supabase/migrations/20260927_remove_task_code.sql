-- Task identifiers are internal UUIDs; remove the human-facing task code column.
alter table public.tasks drop column if exists code;
