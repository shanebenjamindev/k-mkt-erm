-- Apply before deploying the notification UI. Preserves existing records.
begin;
alter table public.workspace_notifications add column if not exists reminded_at timestamptz;

create or replace function public.get_workspace_notification_feed(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc, recent.id desc)
      from (
        select * from public.workspace_notifications
        where user_id = p_user_id
        order by created_at desc, id desc
        limit 40
      ) recent
    ), '[]'::jsonb),
    'unread_count', (
      select count(*) from public.workspace_notifications
      where user_id = p_user_id and read_at is null
    )
  );
$$;
revoke all on function public.get_workspace_notification_feed(uuid) from public, anon, authenticated;
grant execute on function public.get_workspace_notification_feed(uuid) to service_role;
commit;
