create table if not exists public.workspace_settings (
  id integer primary key default 1 check (id = 1),
  accent_color text not null default '#E53935',
  background_preset text not null default 'blush',
  background_image text,
  notification_tone text not null default 'chime',
  theme_mode text not null default 'light',
  high_contrast boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.workspace_settings enable row level security;
