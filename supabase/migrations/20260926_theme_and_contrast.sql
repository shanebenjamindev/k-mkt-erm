alter table public.workspace_settings add column if not exists theme_mode text not null default 'light';
alter table public.workspace_settings add column if not exists high_contrast boolean not null default false;
