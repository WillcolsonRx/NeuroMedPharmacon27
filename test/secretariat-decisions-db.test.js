const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');

test('atomic final decisions: retry deduplication, targeted delivery, quota, private paging and permissions',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,metadata jsonb);');
 const sql=file=>fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8');
 await db.exec(sql('schema.sql'));await db.exec(sql('migrations/20261023_secretariat.sql'));
 const update=sql('migrations/20261102_secretariat_decisions.sql');await db.exec(update);await db.exec(update);
 const actor='00000000-0000-4000-8000-000000000001';
 await db.query('insert into auth.users(id) values($1)',[actor]);await db.query('insert into secretariat_members(user_id) values($1)',[actor]);
 await db.exec("insert into abstracts(full_name,email,title,body,ref_id,preference) select 'Author '||i,'author'||i||'@example.test','Study '||i,'','ABS-'||i,'Oral Communication' from generate_series(1,5) i;");
 const call=async(name,args)=>{const {rows}=await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args);return rows[0].value;};
 const finalize=(id,decision='accepted_poster',version=0,message='Report at 9 AM')=>call('secretariat_finalize',[id,decision,'PRIVATE review',message,actor,version]);
 const first=await finalize(1);assert.equal(first.row.decision,'accepted_poster');assert.equal(first.row.decision_version,1);
 const duplicate=await finalize(1);assert.equal(duplicate.alreadyQueued,true);assert.equal(duplicate.job.id,first.job.id);
 await assert.rejects(finalize(1,'rejected'),/Review changed/);
 await assert.rejects(finalize(1,'accepted_poster',1,'Different message'),/already has a notification/);
 const parallel=await Promise.all([finalize(2,'rejected'),finalize(2,'rejected')]);assert.equal(parallel[0].job.id,parallel[1].job.id);
 let queue=(await db.query('select * from conference_mail_queue order by abstract_id')).rows;assert.equal(queue.length,2);
 assert.equal(queue[0].snapshot.template_version,'2026-11-02');assert.equal(queue[0].snapshot.decision,'accepted_poster');assert.equal(queue[0].snapshot.review_notes,undefined);
 // The default pause prevents immediate and scheduled workers alike.
 assert.equal((await db.query('select * from secretariat_claim_one($1,$2)',[first.job.id,actor])).rows.length,0);
 await db.exec('update conference_mail_settings set paused=false,daily_limit=1 where id=1');
 const claimed=(await db.query('select * from secretariat_claim_one($1,$2)',[first.job.id,actor])).rows;assert.equal(claimed.length,1);assert.equal(claimed[0].abstract_id,1);
 assert.equal((await db.query('select * from secretariat_claim(3)')).rows.length,0);
 assert.equal((await db.query('select * from secretariat_claim_one($1,$2)',[parallel[0].job.id,actor])).rows.length,0);
 await call('secretariat_complete',[first.job.id,claimed[0].lease_id,'sent','provider-1',null]);
 await db.exec('update conference_mail_settings set daily_limit=90 where id=1');
 assert.equal((await db.query('select * from secretariat_claim_one($1,$2)',[first.job.id,actor])).rows.length,0);
 const status=await call('secretariat_notification',[first.job.id]);assert.equal(status.job.status,'sent');
 await db.exec("insert into conference_mail_suppressions(recipient,reason) values('author3@example.test','bounce')");
 await assert.rejects(finalize(3),/suppressed/);assert.equal((await call('secretariat_record',['abstracts',3])).decision,'pending');
 const page=await call('secretariat_records',['abstracts',0,25,null]);assert.equal(page.total,5);assert.equal(page.rows.find(r=>r.id===1).notification_status,'sent');
 await db.exec("insert into registrations(full_name,email,category,tier,amount,payment_proof) values('Delegate','delegate@example.test','student','early',4130,'data:image/png;base64,PRIVATEPROOF')");
 const registrations=await call('secretariat_records',['registrations',0,25,null]);assert.equal(registrations.rows[0].payment_proof,'private');
 assert.match((await call('secretariat_record',['registrations',registrations.rows[0].id])).payment_proof,/PRIVATEPROOF/);
 await assert.rejects(call('secretariat_record',['secretariat_members',1]),/Invalid table/);
 for(const role of ['anon','authenticated','service_role']){
  const permitted=await db.query("select has_function_privilege($1,'secretariat_finalize(bigint,text,text,text,uuid,integer)','execute') as allowed",[role]);assert.equal(permitted.rows[0].allowed,role==='service_role');
 }
 await db.query('update secretariat_members set active=false where user_id=$1',[actor]);await assert.rejects(finalize(4),/not approved/);
});
