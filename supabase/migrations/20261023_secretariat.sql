-- Run after the base schema and abstract-documents migration.
create table if not exists public.secretariat_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 active boolean not null default true
);
alter table public.secretariat_members enable row level security;
create table if not exists public.secretariat_audit (
 id bigint generated always as identity primary key, actor uuid,
 action text not null, record_id text, detail jsonb,
 created_at timestamptz not null default now()
);
alter table public.secretariat_audit enable row level security;
alter table public.abstracts add column if not exists decision text not null default 'pending'
 check (decision in ('pending','accepted_oral','accepted_poster','revision_requested','rejected'));
alter table public.abstracts add column if not exists review_notes text not null default '';
alter table public.abstracts add column if not exists decision_version integer not null default 0;
alter table public.abstracts add column if not exists reviewed_by uuid;
alter table public.abstracts add column if not exists reviewed_at timestamptz;
create table if not exists public.conference_mail_settings (
 id integer primary key check(id=1), paused boolean not null default true,
 daily_limit integer not null default 90 check(daily_limit between 1 and 90),
 usage_day date not null default ((now() at time zone 'UTC')::date), attempts_today integer not null default 0
);
insert into public.conference_mail_settings(id) values(1) on conflict do nothing;
alter table public.conference_mail_settings enable row level security;
create table if not exists public.conference_mail_queue (
 id uuid primary key default gen_random_uuid(), abstract_id bigint references public.abstracts(id),
 decision_version integer, recipient text not null, snapshot jsonb not null,
 status text not null default 'queued' check(status in ('queued','sending','retry','sent','failed','needs_review')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 first_attempt_at timestamptz, lease_id uuid, lease_until timestamptz,
 provider_id text, last_error text, created_by uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(abstract_id,decision_version)
);
alter table public.conference_mail_queue enable row level security;
create index if not exists conference_mail_ready on public.conference_mail_queue(status,available_at);
create index if not exists abstracts_decision_page on public.abstracts(decision,created_at desc);
create table if not exists public.secretariat_login_attempts (
 key text primary key, started_at timestamptz not null default now(), attempts integer not null default 1
);
alter table public.secretariat_login_attempts enable row level security;

alter table public.conference_mail_queue add column if not exists delivery_status text;
create table if not exists public.conference_mail_events (
 event_id text primary key, provider_id text not null, kind text not null,
 created_at timestamptz not null default now()
);
alter table public.conference_mail_events enable row level security;
create table if not exists public.conference_mail_suppressions (
 recipient text primary key, reason text not null, created_at timestamptz not null default now()
);
alter table public.conference_mail_suppressions enable row level security;

create or replace function public.secretariat_login_limit(p_keys text[]) returns boolean
language plpgsql security definer set search_path=public as $$
declare k text; n integer; allowed boolean := true;
begin
 delete from secretariat_login_attempts where started_at < now()-interval '1 day';
 foreach k in array p_keys loop
  insert into secretariat_login_attempts as t(key) values(k)
  on conflict(key) do update set attempts=case when t.started_at<now()-interval '15 minutes' then 1 else t.attempts+1 end,
   started_at=case when t.started_at<now()-interval '15 minutes' then now() else t.started_at end
  returning attempts into n;
  if n>8 then allowed:=false; end if;
 end loop;
 return allowed;
end $$;

create or replace function public.secretariat_records(p_table text,p_page integer,p_limit integer,p_status text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb; total bigint; predicate text := ''; page_size integer:=least(greatest(p_limit,1),50);
begin
 if p_table not in ('abstracts','registrations','sponsorships','mail_logs') then raise exception 'Invalid table';end if;
 if p_table='abstracts' and p_status is not null and p_status<>'' then predicate:=format(' where decision=%L',p_status);end if;
 execute format('select count(*) from %I%s',p_table,predicate) into total;
 execute format('select coalesce(jsonb_agg(t),''[]''::jsonb) from (select * from %I%s order by created_at desc,id desc limit %s offset %s) t',p_table,predicate,page_size,greatest(p_page,0)*page_size) into result;
 return jsonb_build_object('rows',result,'total',total,'page',greatest(p_page,0),'pageSize',page_size);
end $$;

create or replace function public.secretariat_review(p_id bigint,p_decision text,p_notes text,p_actor uuid,p_version integer) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a abstracts;
begin
 if p_decision not in ('pending','accepted_oral','accepted_poster','revision_requested','rejected') then raise exception 'Invalid decision';end if;
 select * into a from abstracts where id=p_id for update;
 if not found or a.decision_version<>p_version then raise exception 'Review changed; reload before saving';end if;
 if a.decision=p_decision then
  update abstracts set review_notes=left(p_notes,4000),reviewed_by=p_actor,reviewed_at=now() where id=p_id returning * into a;
  insert into secretariat_audit(actor,action,record_id) values(p_actor,'review_notes',p_id::text);
  return to_jsonb(a);
 end if;
 if exists(select 1 from conference_mail_queue where abstract_id=p_id and status in ('queued','retry','sending')) then raise exception 'Resolve queued notification before changing decision';end if;
 update abstracts set decision=p_decision,review_notes=left(p_notes,4000),decision_version=decision_version+1,reviewed_by=p_actor,reviewed_at=now() where id=p_id returning * into a;
 insert into secretariat_audit(actor,action,record_id,detail) values(p_actor,'review',p_id::text,jsonb_build_object('decision',p_decision,'version',a.decision_version));
 return to_jsonb(a);
end $$;

create or replace function public.secretariat_preview(p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if cardinality(p_ids) is null or cardinality(p_ids)<1 or cardinality(p_ids)>500 then raise exception 'Select between 1 and 500 abstracts';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'full_name',full_name,'title',title,'ref_id',ref_id,'decision',decision,'version',decision_version) order by id),'[]') from abstracts where id=any(p_ids) and decision<>'pending');
end $$;

create or replace function public.secretariat_enqueue(p_ids bigint[],p_message text,p_actor uuid,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a abstracts; added integer:=0; n integer;
begin
 if cardinality(p_ids) is null or cardinality(p_ids)<1 or cardinality(p_ids)>500 then raise exception 'Select between 1 and 500 abstracts';end if;
 if (select count(*) from abstracts where id=any(p_ids) and decision<>'pending')<>(select count(distinct id) from unnest(p_ids) id) then raise exception 'Selection includes missing or pending reviews';end if;
 for a in select * from abstracts where id=any(p_ids) order by id for update loop
  if a.decision_version<>coalesce((p_versions->>a.id::text)::integer,-1) then raise exception 'Decision changed after preview; reload';end if;
  if exists(select 1 from conference_mail_suppressions where recipient=lower(a.email)) then raise exception 'Recipient suppressed after a bounce or complaint';end if;
  insert into conference_mail_queue(abstract_id,decision_version,recipient,snapshot,created_by)
  values(a.id,a.decision_version,a.email,jsonb_build_object('email',a.email,'full_name',a.full_name,'title',a.title,'ref_id',a.ref_id,'decision',a.decision,'message',left(p_message,4000)),p_actor)
  on conflict(abstract_id,decision_version) do nothing;
  get diagnostics n=row_count;added:=added+n;
 end loop;
 insert into secretariat_audit(actor,action,detail) values(p_actor,'enqueue',jsonb_build_object('requested',cardinality(p_ids),'added',added));
 return jsonb_build_object('queued',added,'alreadyQueued',cardinality(p_ids)-added);
end $$;

create or replace function public.secretariat_enqueue_test(p_snapshot jsonb,p_email text,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare job uuid;
begin
 insert into conference_mail_queue(recipient,snapshot,created_by) values(p_email,p_snapshot,p_actor) returning id into job;
 insert into secretariat_audit(actor,action,record_id) values(p_actor,'test_email',job::text);
 return jsonb_build_object('queued',1,'id',job);
end $$;

create or replace function public.secretariat_claim(p_limit integer) returns setof public.conference_mail_queue
language plpgsql security definer set search_path=public as $$
declare settings conference_mail_settings; job conference_mail_queue; remaining integer;
begin
 select * into settings from conference_mail_settings where id=1 for update;
 if not found then raise exception 'Mail settings unavailable';end if;
 if settings.paused then return;end if;
 if settings.usage_day<>(now() at time zone 'UTC')::date then update conference_mail_settings set usage_day=(now() at time zone 'UTC')::date,attempts_today=0 where id=1;settings.attempts_today:=0;end if;
 -- Never blindly replay a job whose process died after an uncertain delivery.
 update conference_mail_queue set status='needs_review',last_error='Worker interrupted; inspect provider logs before resending',updated_at=now() where status='sending' and lease_until<now();
 update conference_mail_queue set status='needs_review',last_error='Idempotency safety window elapsed; inspect provider logs',updated_at=now() where status='retry' and first_attempt_at<now()-interval '23 hours';
 update conference_mail_queue q set status='failed',last_error='Recipient suppressed after bounce or complaint' where status in ('queued','retry') and exists(select 1 from conference_mail_suppressions s where s.recipient=lower(q.recipient));
 remaining:=least(greatest(p_limit,0),5,settings.daily_limit-settings.attempts_today);
 if remaining<=0 then return;end if;
 for job in select * from conference_mail_queue where status in ('queued','retry') and available_at<=now() order by created_at for update skip locked limit remaining loop
  update conference_mail_queue set status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now() where id=job.id returning * into job;
  update conference_mail_settings set attempts_today=attempts_today+1 where id=1;
  return next job;
 end loop;
end $$;

create or replace function public.secretariat_complete(p_id uuid,p_lease uuid,p_result text,p_provider text,p_error text) returns boolean
language plpgsql security definer set search_path=public as $$
declare updated boolean;
begin
 if p_result not in ('sent','retry','failed','needs_review') then raise exception 'Invalid result';end if;
 update conference_mail_queue set status=case when p_result='retry' and attempts>=5 then 'needs_review' else p_result end,
 provider_id=p_provider,delivery_status=(select kind from conference_mail_events where provider_id=p_provider order by case when kind='complained' then 0 when kind='bounced' then 1 else 2 end limit 1),last_error=left(p_error,500),available_at=now()+interval '15 minutes',lease_until=null,updated_at=now()
 where id=p_id and lease_id=p_lease and status='sending';
 updated:=found;
 if p_result='sent' then
 insert into conference_mail_suppressions(recipient,reason) select lower(q.recipient),q.delivery_status from conference_mail_queue q where q.id=p_id and q.delivery_status in ('bounced','complained') on conflict(recipient) do nothing;
 end if;
 return updated;
end $$;

create or replace function public.secretariat_queue(p_page integer) returns jsonb
language sql security definer set search_path=public as $$
 select jsonb_build_object('rows',(select coalesce(jsonb_agg(t),'[]') from (select id,abstract_id,recipient,snapshot->>'ref_id' as ref_id,status,delivery_status,attempts,provider_id,last_error,created_at from conference_mail_queue order by created_at desc limit 25 offset greatest(p_page,0)*25) t),
 'total',(select count(*) from conference_mail_queue),'counts',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from conference_mail_queue group by status) c),
 'settings',(select to_jsonb(s) from conference_mail_settings s where id=1));
$$;

create or replace function public.secretariat_retry(p_id uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 -- Definitive rejection is safe to retry; ambiguous/stale attempts require provider reconciliation.
 update conference_mail_queue set status='retry',available_at=now(),attempts=0 where id=p_id and status='failed' and first_attempt_at>now()-interval '23 hours';
 if not found then raise exception 'Cannot safely retry this job; inspect provider logs';end if;
 insert into secretariat_audit(actor,action,record_id) values(p_actor,'retry',p_id::text);
 return jsonb_build_object('ok',true);
end $$;

revoke all on public.secretariat_members,public.secretariat_audit,public.secretariat_login_attempts,public.conference_mail_settings,public.conference_mail_queue from anon,authenticated;
grant all on public.secretariat_members,public.secretariat_audit,public.secretariat_login_attempts,public.conference_mail_settings,public.conference_mail_queue to service_role;
grant usage,select on all sequences in schema public to service_role;
do $$ declare f record;begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'secretariat_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

create or replace function public.secretariat_pause(p_paused boolean,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 update conference_mail_settings set paused=p_paused where id=1;
 insert into secretariat_audit(actor,action,detail) values(p_actor,'mail_pause',jsonb_build_object('paused',p_paused));
 return jsonb_build_object('paused',p_paused);
end $$;
revoke all on function public.secretariat_pause(boolean,uuid) from public,anon,authenticated;
grant execute on function public.secretariat_pause(boolean,uuid) to service_role;

create or replace function public.secretariat_mail_event(p_event text,p_provider text,p_kind text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if p_kind not in ('delivered','bounced','complained') then return false;end if;
 insert into conference_mail_events(event_id,provider_id,kind) values(p_event,p_provider,p_kind) on conflict do nothing;
 update conference_mail_queue set delivery_status=p_kind where provider_id=p_provider and (delivery_status is null or delivery_status='delivered' or p_kind in ('bounced','complained'));
 if p_kind in ('bounced','complained') then
  insert into conference_mail_suppressions(recipient,reason) select lower(recipient),p_kind from conference_mail_queue where provider_id=p_provider on conflict(recipient) do update set reason=excluded.reason;
 end if;
 return true;
end $$;
revoke all on public.conference_mail_events,public.conference_mail_suppressions from anon,authenticated;
grant all on public.conference_mail_events,public.conference_mail_suppressions to service_role;
revoke all on function public.secretariat_mail_event(text,text,text) from public,anon,authenticated;
grant execute on function public.secretariat_mail_event(text,text,text) to service_role;

create or replace function public.secretariat_usage() returns jsonb
language sql security definer set search_path=public as $$
 select jsonb_build_object('storageBytes',(select coalesce(sum(case when (metadata->>'size') ~ '^\d+$' then (metadata->>'size')::bigint else 0 end),0) from storage.objects where bucket_id in ('abstract-documents','payment-proofs')),
 'files',(select count(*) from storage.objects where bucket_id in ('abstract-documents','payment-proofs')),
 'registrations',(select count(*) from registrations),'abstracts',(select count(*) from abstracts));
$$;
revoke all on function public.secretariat_usage() from public,anon,authenticated;
grant execute on function public.secretariat_usage() to service_role;

create or replace function public.secretariat_cancel(p_id uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 -- Definitively mark unsent jobs failed. Never cancel an in-flight SMTP attempt.
 update conference_mail_queue set status='failed',last_error='Cancelled by Secretariat',first_attempt_at=null,updated_at=now()
 where id=p_id and status='queued' and attempts=0;
 if not found then raise exception 'Job is already sending or finished';end if;
 insert into secretariat_audit(actor,action,record_id) values(p_actor,'cancel',p_id::text);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.secretariat_cancel(uuid,uuid) from public,anon,authenticated;
grant execute on function public.secretariat_cancel(uuid,uuid) to service_role;

create or replace function public.secretariat_resolve(p_id uuid,p_outcome text,p_evidence text,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if p_outcome not in ('confirmed_sent','confirmed_not_sent') or length(trim(p_evidence))<20 then raise exception 'Record provider-log evidence before resolving an uncertain delivery';end if;
 update conference_mail_queue set status=case when p_outcome='confirmed_sent' then 'sent' else 'queued' end,
 first_attempt_at=case when p_outcome='confirmed_not_sent' then null else first_attempt_at end,
 attempts=case when p_outcome='confirmed_not_sent' then 0 else attempts end,
 available_at=now(),last_error='Manually reconciled by Secretariat',updated_at=now()
 where id=p_id and status='needs_review';
 if not found then raise exception 'Only uncertain jobs can be reconciled';end if;
 insert into secretariat_audit(actor,action,record_id,detail) values(p_actor,'reconcile',p_id::text,jsonb_build_object('outcome',p_outcome,'evidence',left(p_evidence,2000)));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.secretariat_resolve(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.secretariat_resolve(uuid,text,text,uuid) to service_role;
