alter table public.workspace_settings
  add column if not exists workflow jsonb not null default '[{"status":"todo","label":"Chưa bắt đầu"},{"status":"in_progress","label":"Đang làm"},{"status":"pending_review","label":"Chờ duyệt"},{"status":"completed","label":"Đã hoàn thành"}]'::jsonb;
