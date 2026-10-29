-- Run before enabling the R2 receiver. Existing registrations are unchanged.
alter table public.registrations add column if not exists input_hash text;
create or replace function public.intake_registration_store(p_record jsonb)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare result_id bigint; stored_hash text;
begin
  if coalesce(p_record->>'ref_id','') !~ '^NMP27-DEL-[A-F0-9]{32}$'
     or coalesce(p_record->>'input_hash','') !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid intake record';
  end if;
  insert into public.registrations(full_name,email,phone,affiliation,category,tier,workshop,amount,currency,ref_id,payment_ref,payment_proof,proof_filename,proof_mimetype,proof_size,proof_uploaded_at,created_at,input_hash)
  values(p_record->>'full_name',p_record->>'email',p_record->>'phone',p_record->>'affiliation',p_record->>'category',p_record->>'tier',(p_record->>'workshop')::integer,(p_record->>'amount')::numeric,p_record->>'currency',p_record->>'ref_id',p_record->>'payment_ref',p_record->>'payment_proof',p_record->>'proof_filename',p_record->>'proof_mimetype',(p_record->>'proof_size')::integer,(p_record->>'proof_uploaded_at')::timestamptz,(p_record->>'created_at')::timestamptz,p_record->>'input_hash')
  on conflict(ref_id) do nothing;
  select id,input_hash into result_id,stored_hash from public.registrations where ref_id=p_record->>'ref_id';
  if stored_hash is distinct from p_record->>'input_hash' then raise exception 'Intake reference conflict';end if;
  return result_id;
end $$;
revoke all on function public.intake_registration_store(jsonb) from public,anon,authenticated;
grant execute on function public.intake_registration_store(jsonb) to service_role;
