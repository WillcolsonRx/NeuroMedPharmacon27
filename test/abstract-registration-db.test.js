const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('abstract registration migration preserves legacy submissions and enforces private shared limits',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("create role anon;create role authenticated;create role service_role;create table registrations(ref_id text unique,email text);create table abstracts(id serial primary key,title text);insert into abstracts(title) values('Legacy abstract');insert into registrations values('NMP27-DEL-12345','author@example.test');");
 const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261028_abstract_registration.sql'),'utf8');
 await db.exec(migration);await db.exec(migration);
 assert.equal((await db.query('select registration_ref from abstracts')).rows[0].registration_ref,null);
 await assert.rejects(db.query("update abstracts set registration_ref='NMP27-DEL-99999'"),/foreign key/);
 await db.query("update abstracts set registration_ref='NMP27-DEL-12345'");
 for(const role of ['anon','authenticated','service_role']){
  const result=await db.query("select has_function_privilege($1,'abstract_registration_limit(text,text)','EXECUTE') as allowed",[role]);
  assert.equal(result.rows[0].allowed,role==='service_role');
 }
 const check=()=>db.query('select abstract_registration_limit($1,$2) as allowed',['a'.repeat(64),'b'.repeat(64)]);
 for(let i=0;i<20;i++)assert.equal((await check()).rows[0].allowed,true);
 assert.equal((await check()).rows[0].allowed,false);
 await db.exec("update abstract_registration_limits set window_start=now()-interval '16 minutes'");
 assert.equal((await check()).rows[0].allowed,true);
});
