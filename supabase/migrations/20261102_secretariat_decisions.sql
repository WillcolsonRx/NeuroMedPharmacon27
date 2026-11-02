-- Apply after 20261023_secretariat.sql. Additive and repeatable; does not send mail
-- or unpause an existing queue. All new functions remain service-role-only.
create index if not exists abstracts_created_page on public.abstracts(created_at desc,id desc);
create index if not exists registrations_created_page on public.registrations(created_at desc,id desc);
create index if not exists sponsorships_created_page on public.sponsorships(created_at desc,id desc);
create index if not exists mail_logs_created_page on public.mail_logs(created_at desc,id desc);

create or replace function public.secretariat_records(p_table text,p_page integer,p_limit integer,p_status text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; total bigint; predicate text := ''; page_size integer:=least(greatest(p_limit,1),50);
begin
 if p_table not in ('abstracts','registrations','sponsorships','mail_logs') then raise exception 'Invalid table';end if;
 if p_table='abstracts' then
  select count(*) into total from abstracts where coalesce(p_status,'')='' or decision=p_status;
  select coalesce(jsonb_agg(t),'[]'::jsonb) into result from (
   select a.*,q.id as notification_id,q.status as notification_status,q.delivery_status,q.last_error as notification_error
   from (select * from abstracts where coalesce(p_status,'')='' or decision=p_status order by created_at desc,id desc limit page_size offset greatest(p_page,0)*page_size) a
   left join conference_mail_queue q on q.abstract_id=a.id and q.decision_version=a.decision_version
   order by a.created_at desc,a.id desc
  ) t;
 else
  execute format('select count(*) from %I',p_table) into total;
  -- Inline historical proofs are available through authenticated on-demand download,
  -- never repeated as multi-megabyte table cells in each page response.
  if p_table in ('registrations','sponsorships') then
   execute format('select coalesce(jsonb_agg((to_jsonb(t)-''payment_proof'') || jsonb_build_object(''payment_proof'',case when t.payment_proof is not null and t.payment_proof<>'''' then ''private'' else null end)),''[]''::jsonb) from (select * from %I order by created_at desc,id desc limit %s offset %s) t',p_table,page_size,greatest(p_page,0)*page_size) into result;
  else
   execute format('select coalesce(jsonb_agg(t),''[]''::jsonb) from (select * from %I order by created_at desc,id desc limit %s offset %s) t',p_table,page_size,greatest(p_page,0)*page_size) into result;
  end if;
 end if;
 return jsonb_build_object('rows',result,'total',total,'page',greatest(p_page,0),'pageSize',page_size,'mailSettings',(select to_jsonb(s) from conference_mail_settings s where id=1));
end $$;

create or replace function public.secretariat_record(p_table text,p_id bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_table not in ('abstracts','registrations','sponsorships') then raise exception 'Invalid table';end if;
 execute format('select to_jsonb(t) from %I t where id=$1',p_table) into result using p_id;
 return result;
end $$;

create or replace function public.secretariat_finalize(p_id bigint,p_decision text,p_notes text,p_message text,p_actor uuid,p_version integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a abstracts; job conference_mail_queue;
begin
 if not exists(select 1 from secretariat_members where user_id=p_actor and active) then raise exception 'Staff account is not approved';end if;
 if p_decision not in ('accepted_oral','accepted_poster','revision_requested','rejected') or p_version is null then raise exception 'Choose a final decision';end if;
 select * into a from abstracts where id=p_id for update;
 if not found then raise exception 'Abstract not found';end if;
 select * into job from conference_mail_queue where abstract_id=p_id and decision_version=a.decision_version;
 -- Retry after a lost HTTP response returns the exact existing notification.
 -- Another review or different recipient instructions must never be overwritten.
 if job.id is not null and a.decision=p_decision and (a.decision_version=p_version or a.decision_version=p_version+1)
    and coalesce(job.snapshot->>'message','')=left(coalesce(p_message,''),4000)
    and a.review_notes=left(coalesce(p_notes,''),4000) then
  return jsonb_build_object('row',to_jsonb(a),'job',jsonb_build_object('id',job.id,'status',job.status,'delivery_status',job.delivery_status,'last_error',job.last_error),'alreadyQueued',true);
 end if;
 if a.decision_version<>p_version then raise exception 'Review changed; reload before saving';end if;
 if job.id is not null and a.decision=p_decision then raise exception 'This decision already has a notification; check delivery status';end if;
 if exists(select 1 from conference_mail_queue where abstract_id=p_id and status in ('queued','retry','sending','needs_review')) then raise exception 'Resolve queued notification before changing decision';end if;
 if exists(select 1 from conference_mail_suppressions where recipient=lower(a.email)) then raise exception 'Recipient suppressed after a bounce or complaint';end if;
 update abstracts set decision=p_decision,review_notes=left(coalesce(p_notes,''),4000),decision_version=decision_version+case when decision=p_decision then 0 else 1 end,reviewed_by=p_actor,reviewed_at=now() where id=p_id returning * into a;
 insert into conference_mail_queue(abstract_id,decision_version,recipient,snapshot,created_by)
 values(a.id,a.decision_version,a.email,jsonb_build_object('email',a.email,'full_name',a.full_name,'title',a.title,'ref_id',a.ref_id,'registration_ref',a.registration_ref,'decision',a.decision,'message',left(coalesce(p_message,''),4000),'template_version','2026-11-02'),p_actor)
 returning * into job;
 insert into secretariat_audit(actor,action,record_id,detail) values(p_actor,'finalize_and_notify',p_id::text,jsonb_build_object('decision',a.decision,'version',a.decision_version,'job_id',job.id));
 return jsonb_build_object('row',to_jsonb(a),'job',jsonb_build_object('id',job.id,'status',job.status),'alreadyQueued',false);
end $$;

create or replace function public.secretariat_claim_one(p_id uuid,p_actor uuid) returns setof public.conference_mail_queue
language plpgsql security definer set search_path=public,pg_temp as $$
declare settings conference_mail_settings; job conference_mail_queue;
begin
 if not exists(select 1 from secretariat_members where user_id=p_actor and active) then raise exception 'Staff account is not approved';end if;
 select * into settings from conference_mail_settings where id=1 for update;
 if not found then raise exception 'Mail settings unavailable';end if;
 if settings.paused then return;end if;
 if settings.usage_day<>(now() at time zone 'UTC')::date then update conference_mail_settings set usage_day=(now() at time zone 'UTC')::date,attempts_today=0 where id=1;settings.attempts_today:=0;end if;
 if settings.attempts_today>=settings.daily_limit then return;end if;
 update conference_mail_queue set status='needs_review',last_error='Worker interrupted; inspect provider logs before resending',updated_at=now() where id=p_id and status='sending' and lease_until<now();
 update conference_mail_queue set status='needs_review',last_error='Idempotency safety window elapsed; inspect provider logs',updated_at=now() where id=p_id and status='retry' and first_attempt_at<now()-interval '23 hours';
 update conference_mail_queue q set status='failed',last_error='Recipient suppressed after bounce or complaint' where id=p_id and status in ('queued','retry') and exists(select 1 from conference_mail_suppressions s where s.recipient=lower(q.recipient));
 select * into job from conference_mail_queue where id=p_id and status in ('queued','retry') and available_at<=now() for update skip locked;
 if not found then return;end if;
 update conference_mail_queue set status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now() where id=p_id returning * into job;
 update conference_mail_settings set attempts_today=attempts_today+1 where id=1;
 return next job;
end $$;

create or replace function public.secretariat_notification(p_id uuid) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('job',(select jsonb_build_object('id',id,'status',status,'delivery_status',delivery_status,'last_error',last_error) from conference_mail_queue where id=p_id),'settings',(select to_jsonb(s) from conference_mail_settings s where id=1));
$$;

revoke all on function public.secretariat_records(text,integer,integer,text),public.secretariat_record(text,bigint),public.secretariat_finalize(bigint,text,text,text,uuid,integer),public.secretariat_claim_one(uuid,uuid),public.secretariat_notification(uuid) from public,anon,authenticated;
grant execute on function public.secretariat_records(text,integer,integer,text),public.secretariat_record(text,bigint),public.secretariat_finalize(bigint,text,text,text,uuid,integer),public.secretariat_claim_one(uuid,uuid),public.secretariat_notification(uuid) to service_role;
