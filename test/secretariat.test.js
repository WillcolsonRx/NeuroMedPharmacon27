const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const express=require('express');
const {createSecretariat,processMailQueue,decisionEmail,handleMailEvent}=require('../secretariat');
const snapshot={id:1,version:1,full_name:'<script>Author</script>',title:'Study <img>',ref_id:'ABS-1',email:'author@example.test',decision:'accepted_oral'};

test('decision receipts escape user input and separate acceptance from payment',()=>{
 const mail=decisionEmail({snapshot:{...snapshot,message:'<iframe>Instructions'}});
 assert.ok(!mail.html.includes('<script>'));assert.match(mail.html,/&lt;script&gt;/);
 assert.match(mail.text,/does not confirm registration or payment/);assert.match(mail.html,/&lt;iframe&gt;/);
});

test('queue worker uses stable idempotency keys and records provider rejection without sending attachments',async()=>{
 const calls=[];
 const jobs=[{id:'job-1',lease_id:'lease-1',recipient:'author@example.test',snapshot},{id:'job-2',lease_id:'lease-2',recipient:'other@example.test',snapshot}];
 const storage={rpc:async(name,args)=>{calls.push({name,args});return name==='secretariat_claim'?jobs:true;}};
 const sent=[];
 const result=await processMailQueue({storage,env:{MAIL_PROVIDER:'resend',RESEND_API_KEY:'test-only',MAIL_FROM:'Conference <mail@example.test>'},fetchImpl:async(url,options)=>{sent.push(options);return sent.length===1?{ok:true,json:async()=>({id:'provider-1'})}:{ok:false,status:429};}});
 assert.deepEqual(result.map(r=>r.status),['sent','retry']);assert.equal(sent[0].headers['Idempotency-Key'],'nmp-decision-job-1');assert.equal(JSON.parse(sent[0].body).attachments,undefined);
 assert.equal(calls[1].args.p_lease,'lease-1');assert.equal(calls[2].args.p_result,'retry');
});

test('worker does not claim jobs when mail credentials are missing',async()=>{
 await assert.rejects(processMailQueue({storage:{rpc(){assert.fail('must not claim');}},env:{MAIL_PROVIDER:'resend'}}),/Configure Resend/);
});

test('Secretariat requires approved MFA sessions, origin checks and no shared token',async t=>{
 const app=express();app.use(express.json());
 const token='header.'+Buffer.from(JSON.stringify({aal:'aal2'})).toString('base64url')+'.signature';
 const aal1='header.'+Buffer.from(JSON.stringify({aal:'aal1'})).toString('base64url')+'.signature';
 const calls=[];
 const storage={request:async()=>[{user_id:'staff-1'}],signRows:async rows=>rows,rpc:async(name,args)=>{calls.push({name,args});if(name==='secretariat_preview')return [snapshot];return {rows:[],total:0};}};
 app.use('/api/secretariat',createSecretariat({storage,env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only',APP_URL:'https://conference.example.test'},fetchImpl:async()=>({ok:true,json:async()=>({id:'staff-1',email:'staff@example.test'})})}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}/api/secretariat`;
 assert.equal((await fetch(base+'/records/abstracts?token=change-me')).status,401);
 assert.equal((await fetch(base+'/records/abstracts',{headers:{cookie:'__Host-nmp_session='+aal1}})).status,403);
 assert.equal((await fetch(base+'/records/abstracts',{headers:{cookie:'__Host-nmp_session='+token}})).status,200);
 const headers={cookie:'__Host-nmp_session='+token,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/campaign',{method:'POST',headers,body:'{}'})).status,403);
 const preview=await fetch(base+'/preview',{method:'POST',headers:{...headers,origin:'https://conference.example.test'},body:JSON.stringify({ids:[1]})});
 const result=await preview.json();assert.equal(result.previews[0].version,1);
 const testMail=await fetch(base+'/test-email',{method:'POST',headers:{...headers,origin:'https://conference.example.test'},body:JSON.stringify({id:1,email:'attacker@example.test'})});assert.equal(testMail.status,200);
 assert.equal(calls.at(-1).args.p_email,'staff@example.test');
});

test('mail webhook verifies signatures and records bounce events',async()=>{
 const secret=crypto.randomBytes(32),id='event-1',timestamp=String(Math.floor(Date.now()/1000));
 const body=Buffer.from(JSON.stringify({type:'email.bounced',data:{email_id:'provider-1'}}));
 const sig=crypto.createHmac('sha256',secret).update(`${id}.${timestamp}.`).update(body).digest('base64');
 const calls=[];let status=200;
 const res={status(code){status=code;return this;},json(){return this;}};
 const req={body,headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':'v1,'+sig}};
 await handleMailEvent({req,res,env:{RESEND_WEBHOOK_SECRET:'whsec_'+secret.toString('base64')},storage:{rpc:async(name,args)=>calls.push({name,args})}});
 assert.equal(calls[0].args.p_kind,'bounced');assert.equal(status,200);
 req.headers['svix-signature']='v1,bad';
 await handleMailEvent({req,res,env:{RESEND_WEBHOOK_SECRET:'whsec_'+secret.toString('base64')},storage:{rpc:async()=>assert.fail()}});assert.equal(status,403);
});

test('existing SMTP works without a new provider and ambiguous failures require review',async()=>{
 const complete=[];let count=0;
 const storage={rpc:async(name,args)=>{if(name==='secretariat_claim')return [1,2].map(id=>({id:'smtp-'+id,lease_id:'lease-'+id,recipient:'author@example.test',snapshot}));complete.push(args);return true;}};
 const result=await processMailQueue({storage,env:{MAIL_PROVIDER:'smtp',MAIL_FROM:'sender@example.test'},smtpTransport:{sendMail:async mail=>{assert.equal(mail.attachments,undefined);if(count++===0)return {messageId:'smtp-message',accepted:['author@example.test']};throw Error('Disconnected before confirmation');}}});
 assert.deepEqual(result.map(r=>r.status),['sent','needs_review']);assert.equal(complete[1].p_result,'needs_review');
});

test('password login issues only a secure cookie, MFA upgrades it, and removed staff lose access',async t=>{
 const actor='00000000-0000-4000-8000-000000000001';
 const token=aal=>'header.'+Buffer.from(JSON.stringify({aal})).toString('base64url')+'.signature';
 const low=token('aal1'),high=token('aal2');let approved=true,allowed=true;
 const factor='00000000-0000-4000-8000-000000000002';
 const storage={request:async()=>approved?[{user_id:actor}]:[],signRows:async rows=>rows,rpc:async name=>name==='secretariat_login_limit'?allowed:{rows:[],total:0}};
 const auth=[];
 const app=express();app.use(express.json());app.use('/api/secretariat',createSecretariat({storage,env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only',APP_URL:'https://conference.example.test'},fetchImpl:async(url,options)=>{
  auth.push({url:String(url),options});
  const path=new URL(url).pathname;
  const body=path.endsWith('/token')?{access_token:low}:path.endsWith('/verify')?{access_token:high}:path.endsWith('/challenge')?{id:'challenge-1'}:{id:actor,email:'staff@example.test',factors:[]};
  return {ok:true,json:async()=>body};
 }}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}/api/secretariat`;
 const headers={origin:'https://conference.example.test','Content-Type':'application/json'};
 const login=await fetch(base+'/login',{method:'POST',headers,body:JSON.stringify({email:'staff@example.test',password:'test-only'})});
 assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await login.json()).access_token,undefined);
 const verify=await fetch(base+'/verify',{method:'POST',headers:{...headers,cookie:'__Host-nmp_session='+low},body:JSON.stringify({factorId:factor,code:'123456'})});
 assert.equal(verify.status,200);assert.ok(verify.headers.get('set-cookie').includes(high));
 approved=false;
 assert.equal((await fetch(base+'/records/abstracts',{headers:{cookie:'__Host-nmp_session='+high}})).status,403);
 allowed=false;const count=auth.length;
 assert.equal((await fetch(base+'/login',{method:'POST',headers,body:JSON.stringify({email:'staff@example.test',password:'test-only'})})).status,429);
 assert.equal(auth.length,count);
});

test('password recovery uses the deployed redirect, checks staff approval and preserves MFA',async t=>{
 const actor='00000000-0000-4000-8000-000000000001',factor='00000000-0000-4000-8000-000000000002';
 const token=aal=>'header.'+Buffer.from(JSON.stringify({aal})).toString('base64url')+'.signature';
 const low=token('aal1'),high=token('aal2');let approved=true;
 const auth=[];
 const storage={request:async()=>approved?[{user_id:actor}]:[],rpc:async()=>true};
 const app=express();app.use(express.json());app.use('/api/secretariat',createSecretariat({storage,env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only',APP_URL:'https://conference.example.test'},fetchImpl:async(url,options)=>{
  auth.push({url:String(url),options});return {ok:true,json:async()=>({id:actor,email:'staff@example.test',factors:[{id:factor,factor_type:'totp',status:'verified'}]})};
 }}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}/api/secretariat`;
 const headers={origin:'https://conference.example.test','Content-Type':'application/json'};
 const post=(route,body,cookie)=>fetch(base+route,{method:'POST',headers:{...headers,...(cookie?{cookie:'__Host-nmp_session='+cookie}:{})},body:JSON.stringify(body)});
 const recovery=await post('/recover',{email:'staff@example.test'});assert.equal(recovery.status,200);
 const sent=new URL(auth[0].url);assert.equal(sent.searchParams.get('redirect_to'),'https://conference.example.test/secretariat/reset');
 const exchange=await post('/recovery-session',{accessToken:low});assert.equal(exchange.status,200);assert.match(exchange.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const state=await fetch(base+'/recovery-state',{headers:{cookie:'__Host-nmp_session='+low}});assert.equal((await state.json()).mfaRequired,true);
 assert.equal((await post('/password',{password:'a-new-strong-password'},low)).status,403);
 assert.ok(!auth.some(call=>call.options.method==='PUT'));
 assert.equal((await post('/password',{password:'short'},high)).status,400);
 const changed=await post('/password',{password:'a-new-strong-password'},high);assert.equal(changed.status,200);assert.match(changed.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal(JSON.parse(auth.find(call=>call.options.method==='PUT').options.body).password,'a-new-strong-password');
 assert.ok(!auth.some(call=>call.options.method==='DELETE'));
 approved=false;
 const rejected=await post('/recovery-session',{accessToken:low});assert.equal(rejected.status,403);assert.equal(rejected.headers.get('set-cookie'),null);
 const expired=await post('/recovery-session',{accessToken:'invalid'});assert.equal(expired.status,400);
});
