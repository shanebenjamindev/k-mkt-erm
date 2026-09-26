alter table public.tasks
  add column if not exists brief_images jsonb not null default '[]'::jsonb;
