-- OAuth tokens are encrypted on the server and scoped to one workspace member.
create table if not exists public.facebook_connections (
  user_id uuid primary key references public.team_members(id) on delete cascade,
  encrypted_token text not null,
  facebook_name text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now()
);
alter table public.facebook_connections enable row level security;
revoke all on public.facebook_connections from anon, authenticated;
grant all on public.facebook_connections to service_role;
