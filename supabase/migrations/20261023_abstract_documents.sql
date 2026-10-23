-- Run in your existing project's Supabase SQL Editor before redeploying.
alter table public.abstracts add column if not exists document_path text;
alter table public.abstracts add column if not exists document_filename text;
alter table public.abstracts add column if not exists document_mimetype text;
alter table public.abstracts add column if not exists document_size integer;
alter table public.abstracts add column if not exists preference text;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('abstract-documents','abstract-documents',false,2097152,
 array['application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
