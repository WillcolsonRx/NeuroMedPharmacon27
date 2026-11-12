const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
test('R2 import migration is repeatable, service-only and idempotent without overwriting registrations',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table public.registrations(id bigint generated always as identity primary key,full_name text,email text,phone text,affiliation text,category text,tier text,workshop int,amount numeric,currency text,ref_id text unique,payment_ref text,payment_proof text,proof_filename text,proof_mimetype text,proof_size integer,proof_uploaded_at timestamptz,created_at timestamptz);`);
 const sql=fs.readFileSync('supabase/migrations/20261029_r2_registration_intake.sql','utf8');await db.exec(sql);await db.exec(sql);
 const numbered=fs.readFileSync('supabase/migrations/20261112_sequential_registration_numbers.sql','utf8');await db.exec(numbered);await db.exec(numbered);
 const row={ref_id:'NMP27-DEL-'+'A'.repeat(32),input_hash:'b'.repeat(64),full_name:'Test',email:'test@example.test',tier:'early',category:'student',amount:3500,created_at:new Date().toISOString()};
 const first=await db.query('select public.intake_registration_store($1::jsonb) as id',[JSON.stringify(row)]);const second=await db.query('select public.intake_registration_store($1::jsonb) as id',[JSON.stringify(row)]);assert.equal(first.rows[0].id,second.rows[0].id);
 await assert.rejects(db.query('select public.intake_registration_store($1::jsonb)',[JSON.stringify({...row,input_hash:'c'.repeat(64)})]),/conflict/);
 const newId=await db.query('select public.intake_registration_store($1::jsonb) as id',[JSON.stringify({...row,ref_id:'NMP27-A1'})]);assert.notEqual(newId.rows[0].id,first.rows[0].id);
 assert.equal((await db.query('select public.intake_registration_store($1::jsonb) as id',[JSON.stringify({...row,ref_id:'NMP27-A1'})])).rows[0].id,newId.rows[0].id);
 for(const invalid of ['NMP27-A0','NMP27-A01','NMP27-A-1'])await assert.rejects(db.query('select public.intake_registration_store($1::jsonb)',[JSON.stringify({...row,ref_id:invalid})]),/Invalid intake/);
 assert.equal((await db.query('select count(*)::int as count from public.registrations')).rows[0].count,2);
 for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_function_privilege('${role}','public.intake_registration_store(jsonb)','execute') as allowed`)).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('service_role','public.intake_registration_store(jsonb)','execute') as allowed")).rows[0].allowed,true);
 }finally{await db.close();}
});
