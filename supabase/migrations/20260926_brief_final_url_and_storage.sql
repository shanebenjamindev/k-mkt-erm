alter table public.tasks
  add column if not exists brief_final_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brief-images',
  'brief-images',
  false,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
