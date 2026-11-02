const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createSecretariat,decisionEmail,decisionTemplates}=require('../secretariat');

test('decision snippets personalize oral, poster and rejection without exposing review notes',()=>{
 for(const decision of Object.keys(decisionTemplates)){
  const mail=decisionEmail({snapshot:{template_version:'2026-11-02',decision,full_name:'<Author>',title:'A study',ref_id:'ABS-1',message:'<Instructions>',review_notes:'TOP SECRET'}});
  assert.ok(mail.text.includes(decisionTemplates[decision].message));assert.ok(!mail.html.includes('TOP SECRET'));assert.match(mail.html,/&lt;Author&gt;/);assert.match(mail.html,/&lt;Instructions&gt;/);
 }
});

test('authenticated on-demand files and immediate single-decision mail, including provider failures',async t=>{
 const actor='00000000-0000-4000-8000-000000000001';
 const token='header.'+Buffer.from(JSON.stringify({aal:'aal2'})).toString('base64url')+'.signature';
 const calls=[],sent=[];let file='supabase://abstract-documents/one.docx',approved=true,paused=false,providerStatus=200;
 const row={id:1,decision:'pending',decision_version:0,full_name:'Author',email:'delegate@example.test',title:'Study',ref_id:'ABS-1',preference:'Oral Communication',review_notes:'Private!'};
 let job;
 const storage={request:async()=>approved?[{user_id:actor}]:[],signRows:async rows=>{calls.push({name:'sign',args:rows});return rows.map(r=>({document_path:'https://project.supabase.co/storage/v1/object/sign/abstract-documents/one.docx?token=private'}));},rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='secretariat_records')return {rows:[{...row,document_path:file}],total:1};
  if(name==='secretariat_record')return {...row,document_path:file};
  if(name==='secretariat_finalize'){
   assert.equal(args.p_actor,actor);job={id:'job-1',lease_id:'lease-1',status:'queued',recipient:row.email,snapshot:{...row,decision:args.p_decision,message:args.p_message,template_version:'2026-11-02'}};return {row:{...row,decision:args.p_decision,decision_version:1},job:{id:job.id,status:job.status}};
  }
  if(name==='secretariat_claim_one'){assert.equal(args.p_id,'job-1');assert.equal(args.p_actor,actor);return paused?[]:[job];}
  if(name==='secretariat_claim')assert.fail('Must not claim unrelated jobs');
  if(name==='secretariat_complete'){job.status=args.p_result;job.last_error=args.p_error;return true;}
  if(name==='secretariat_notification')return {job:{id:job.id,status:job.status,last_error:job.last_error},settings:{paused,usage_day:'2000-01-01',attempts_today:0,daily_limit:90}};
 }};
 const app=express();app.use(express.json());app.use('/api/secretariat',createSecretariat({storage,env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',APP_URL:'https://conference.example.test',MAIL_PROVIDER:'resend',RESEND_API_KEY:'test',MAIL_FROM:'mail@example.test'},fetchImpl:async(url,options)=>{
  if(new URL(url).hostname==='api.resend.com'){sent.push(JSON.parse(options.body));return {ok:providerStatus===200,status:providerStatus,json:async()=>({id:'provider-1'})};}
  return {ok:true,json:async()=>({id:actor,email:'staff@example.test'})};
 }}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/api/secretariat`;
 const headers={cookie:'__Host-nmp_session='+token,origin:'https://conference.example.test','Content-Type':'application/json'};
 const post=(route,body,head=headers)=>fetch(base+route,{method:'POST',headers:head,body:JSON.stringify(body)});
 const list=await (await fetch(base+'/records/abstracts',{headers})).json();assert.ok(list.templates.accepted_poster);assert.equal(calls.filter(c=>c.name==='sign').length,0);
 const download=await fetch(base+'/files/abstracts/1',{headers,redirect:'manual'});assert.equal(download.status,302);assert.match(download.headers.get('location'),/^https:\/\/project.supabase.co\//);assert.equal(calls.filter(c=>c.name==='sign').length,1);
 file='https://external.example/file';assert.equal((await fetch(base+'/files/abstracts/1',{headers})).status,404);
 assert.equal((await fetch(base+'/files/secretariat_members/1',{headers})).status,404);
 assert.equal((await fetch(base+'/files/abstracts/1')).status,401);
 const draft={id:1,decision:'accepted_poster',version:0,notes:'Private!',message:'Bring a poster',confirm:true,p_actor:'attacker'};
 const preview=await (await post('/decision-preview',draft)).json();assert.match(preview.text,/poster presentation/);assert.ok(!preview.text.includes('Private!'));assert.equal(sent.length,0);
 assert.equal((await post('/decision-preview',{...draft,version:99})).status,409);
 assert.equal((await post('/finalize',{...draft,decision:'toString'})).status,400);
 assert.equal((await post('/finalize',draft,{...headers,origin:'https://evil.example'})).status,403);
 const finalized=await (await post('/finalize',draft)).json();assert.equal(finalized.notification.status,'sent');assert.deepEqual(sent[0].to,['delegate@example.test']);assert.match(sent[0].html,/Bring a poster/);
 providerStatus=429;const retry=await (await post('/finalize',draft)).json();assert.equal(retry.notification.status,'retry');assert.match(retry.notification.last_error,/429/);
 paused=true;const count=sent.length;const held=await (await post('/finalize',draft)).json();assert.equal(held.notification.status,'queued');assert.equal(held.notification.paused,true);assert.equal(sent.length,count);
 approved=false;assert.equal((await post('/finalize',draft)).status,403);
});
