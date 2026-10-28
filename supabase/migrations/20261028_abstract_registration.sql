-- Run in Supabase SQL Editor before deploying the registration-gated abstract form.
-- Existing abstracts remain valid; their registration reference stays null.
alter table public.abstracts add column if not exists registration_ref text references public.registrations(ref_id);
create index if not exists abstracts_registration_ref_idx on public.abstracts(registration_ref);

-- Shared limits survive Vercel restarts and apply across function instances.
create table if not exists public.abstract_registration_limits (
  key_hash text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.abstract_registration_limits enable row level security;
revoke all on public.abstract_registration_limits from public, anon, authenticated;
grant all on public.abstract_registration_limits to service_role;
create or replace function public.abstract_registration_limit(p_ip_hash text,p_email_hash text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_key text; v_count integer; v_max integer; v_allowed boolean := true;
begin
  if p_ip_hash is null or p_email_hash is null
     or p_ip_hash !~ '^[a-f0-9]{64}$' or p_email_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid rate-limit key';
  end if;
  delete from public.abstract_registration_limits where window_start < now()-interval '1 day';
  foreach v_key in array array[p_ip_hash,p_email_hash] loop
    v_max := case when v_key=p_email_hash then 20 else 300 end;
    insert into public.abstract_registration_limits(key_hash,window_start,attempts)
    values(v_key,now(),1)
    on conflict(key_hash) do update set
      attempts=case when abstract_registration_limits.window_start < now()-interval '15 minutes'
        then 1 else abstract_registration_limits.attempts+1 end,
      window_start=case when abstract_registration_limits.window_start < now()-interval '15 minutes'
        then now() else abstract_registration_limits.window_start end
    returning attempts into v_count;
    if v_count>v_max then v_allowed:=false; end if;
  end loop;
  return v_allowed;
end;
$$;
revoke all on function public.abstract_registration_limit(text,text) from public, anon, authenticated;
grant execute on function public.abstract_registration_limit(text,text) to service_role;
