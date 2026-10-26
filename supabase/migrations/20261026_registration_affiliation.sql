-- Run once in the existing Supabase project's SQL Editor before deploying.
alter table public.registrations add column if not exists affiliation text not null default '';
