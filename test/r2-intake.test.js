const test=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {prepareIntake,receiveIntake,authorized,intakeConfig}=require('../r2Intake');
const {processIntakeStage}=require('../r2RegistrationProcessor');
const token='test-only-secret-'.repeat(3),proof='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII=';
function make(overrides={}){return prepareIntake({submission_id:'c623fa84-a8cf-4708-92f9-10de23ce0863',full_name:'Test Delegate',email:'TEST@example.test',affiliation:'Test University',phone:'123',category:'student',workshop:0,payment_ref:'DU12345',payment_proof:proof,proof_filename:'proof.png',...overrides},{tier:'early',prices:{student:3500,workshop:600},token});}
class Bucket{
 constructor(){this.data=new Map();this.writes=0;this.fail=false;}
 async put(key,value,options={}){if(this.fail)throw Error('R2 unavailable');const old=this.data.get(key),cond=options.onlyIf;if(cond?.etagDoesNotMatch==='*'&&old || cond?.etagMatches&&old?.etag!==cond.etagMatches)return null;const obj={key,value:String(value),etag:String(++this.writes),uploaded:new Date()};this.data.set(key,obj);return {etag:obj.etag};}
 async get(key){const o=this.data.get(key);return o?{etag:o.etag,text:async()=>o.value,json:async()=>JSON.parse(o.value)}:null;}
 async delete(key){this.data.delete(key);}
 async list({prefix,limit=100,cursor}){const keys=[...this.data.keys()].filter(k=>k.startsWith(prefix)&&(!cursor||k>cursor)).sort(),page=keys.slice(0,limit);return {objects:page.map(k=>this.data.get(k)),truncated:keys.length>limit,cursor:page.at(-1)};}
}
function env(){return {INTAKE:new Bucket(),INTAKE_TOKEN:token,RECOVERY_TOKEN:'recovery-'.repeat(6),CALLBACK_TOKEN:'callback-'.repeat(6),CALLBACK_URL:'https://conference.example/api/internal/r2-registration',TELEGRAM_BOT_TOKEN:'test-bot',TELEGRAM_CHAT_ID:'test-chat',PROCESSING:{send:async()=>{}}};}
const request=record=>new Request('https://intake.example/intake',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(record)});

test('intake validation creates stable identifiers, canonical pricing and rejects malformed input',async()=>{
 const a=make(),b=make();assert.equal(a.ref_id,b.ref_id);assert.equal(a.input_hash,b.input_hash);assert.equal(a.amount,3500);assert.equal(a.email,'test@example.test');assert.match(a.ref_id,/^NMP27-DEL-[A-F0-9]{32}$/);
 assert.throws(()=>make({email:'invalid'}));assert.throws(()=>make({submission_id:'123'}));assert.throws(()=>make({payment_proof:'junk'}));assert.throws(()=>make({workshop:'false'}));assert.notEqual(make({full_name:'Other Name'}).input_hash,a.input_hash);
 assert.equal(authorized('Bearer '+token,token),true);assert.equal(authorized('Bearer wrong',token),false);assert.throws(()=>intakeConfig({R2_INTAKE_URL:'http://unsafe.test',R2_INTAKE_TOKEN:token}));
 await assert.rejects(receiveIntake(a,{url:'https://intake.example',token},async()=>({ok:true,json:async()=>({accepted:false})})),/not be confirmed/);
});

test('R2 acknowledges durable originals, deduplicates retries, rejects changed bodies and fails closed on outage',async()=>{
 const {default:worker}=await import('../cloudflare/registration-intake/worker.mjs');const e=env(),r=make();
 assert.equal((await worker.fetch(new Request('https://intake.example/intake',{method:'POST',body:'{}'}),e,{})).status,401);
 const initial=await worker.fetch(request(r),e,{});assert.equal(initial.status,202);assert.equal(e.INTAKE.data.has('records/'+r.ref_id+'.json'),true);assert.equal(e.INTAKE.data.has('pending/'+r.ref_id+'.json'),true);
 assert.equal((await worker.fetch(request({...r,amount:4000,tier:'regular'}),e,{})).status,202);assert.equal((await (await worker.fetch(request(r),e,{})).json()).amount,3500);
 assert.equal((await worker.fetch(request(make({full_name:'Changed'})),e,{})).status,409);
 e.INTAKE.fail=true;assert.equal((await worker.fetch(request(make({submission_id:randomUUID()})),e,{})).status,503);
});

test('Supabase outage still delivers both emails; stored record survives and replication retries independently',async t=>{
 const {default:worker,processRecord}=await import('../cloudflare/registration-intake/worker.mjs');const e=env(),record=make();await worker.fetch(request(record),e,{});
 const old=global.fetch;let down=true;const calls=[];global.fetch=async(url,options)=>{if(String(url).includes('telegram'))return {ok:true,json:async()=>({ok:true})};const stage=JSON.parse(options.body).stage;calls.push(stage);return {ok:stage!=='database'||!down,json:async()=>stage==='database'?{stored:true}:{status:'sent'}};};t.after(()=>global.fetch=old);
 await processRecord(e,record.ref_id,1000000);let s=await (await e.INTAKE.get('pending/'+record.ref_id+'.json')).json();assert.equal(s.database,'pending');assert.equal(s.organizer,'sent');assert.equal(s.delegate,'sent');assert.equal(s.last_alert,1000000);
 down=false;await processRecord(e,record.ref_id,2000000);assert.equal(e.INTAKE.data.has('records/'+record.ref_id+'.json'),true);assert.equal(e.INTAKE.data.has('pending/'+record.ref_id+'.json'),false);assert.equal(e.INTAKE.data.has('completed/'+record.ref_id+'.json'),true);assert.equal(calls.filter(x=>x==='organizer').length,1);
});

test('concurrent processing claims one lease; ambiguous SMTP is held for evidenced manual recovery',async t=>{
 const {default:worker,processRecord}=await import('../cloudflare/registration-intake/worker.mjs');const e=env(),record=make();await worker.fetch(request(record),e,{});
 const old=global.fetch;let sends=0;global.fetch=async(url,options)=>{if(String(url).includes('telegram'))return {ok:true,json:async()=>({ok:true})};const stage=JSON.parse(options.body).stage;if(stage==='organizer'){sends++;throw Error('response lost');}return {ok:true,json:async()=>stage==='database'?{stored:true}:{status:'sent'}};};t.after(()=>global.fetch=old);
 await Promise.all([processRecord(e,record.ref_id,1000000),processRecord(e,record.ref_id,1000000)]);
 await processRecord(e,record.ref_id,2000000);assert.equal(sends,1);assert.equal((await (await e.INTAKE.get('pending/'+record.ref_id+'.json')).json()).organizer,'needs_review');
 const retryBody={ref_id:record.ref_id,recipient:'organizer',confirmed_not_sent:true,evidence:'Inspected provider logs: no message accepted.'};
 const retry=()=>new Request('https://intake.example/recovery/retry',{method:'POST',headers:{Authorization:'Bearer '+e.RECOVERY_TOKEN},body:JSON.stringify(retryBody)});
 assert.equal((await worker.fetch(retry(),e,{})).status,200);assert.equal([...e.INTAKE.data.keys()].some(k=>k.startsWith('audit/')),true);
 assert.equal((await worker.fetch(new Request('https://intake.example/recovery/records'),e,{})).status,401);
 const recovery=await worker.fetch(new Request('https://intake.example/recovery/records/'+record.ref_id,{headers:{Authorization:'Bearer '+e.RECOVERY_TOKEN}}),e,{});assert.equal((await recovery.json()).record.payment_proof,proof);
});

test('cron recovers a failed enqueue and completed records do not obstruct the recovery scan',async t=>{
 const {default:worker,sweep}=await import('../cloudflare/registration-intake/worker.mjs');const e=env(),record=make();e.PROCESSING.send=async()=>{throw Error('queue outage');};assert.equal((await worker.fetch(request(record),e,{})).status,202);
 const old=global.fetch;global.fetch=async(url,options)=>({ok:true,json:async()=>JSON.parse(options.body).stage==='database'?{stored:true}:{status:'sent'}});t.after(()=>global.fetch=old);
 await sweep(e);assert.equal(e.INTAKE.data.has('pending/'+record.ref_id+'.json'),false);assert.equal(e.INTAKE.data.has('records/'+record.ref_id+'.json'),true);
});

test('database replication uses deterministic proof paths and the idempotent RPC',async()=>{
 const r=make(),calls=[];const storage={request:async(...args)=>calls.push(args),rpc:async(...args)=>calls.push(args)};
 await processIntakeStage(r,'database',storage);assert.equal(calls[0][0],'/storage/v1/object/payment-proofs/r2-intake/'+r.ref_id+'.png');assert.equal(calls[1][0],'intake_registration_store');assert.equal(calls[1][1].p_record.input_hash,r.input_hash);assert.equal(calls[1][1].p_record.payment_proof.startsWith('supabase://'),true);
 await assert.rejects(processIntakeStage(r,'database',null));
});

test('a record with unconfirmed processing-state storage is retained but never acknowledged prematurely',async()=>{
 const {default:worker}=await import('../cloudflare/registration-intake/worker.mjs');const e=env(),record=make();const original=e.INTAKE.put.bind(e.INTAKE);let failState=true;e.INTAKE.put=async(k,...args)=>{if(k.startsWith('pending/')&&failState)throw Error('state unavailable');return original(k,...args);};
 assert.equal((await worker.fetch(request(record),e,{})).status,503);assert.equal(e.INTAKE.data.has('records/'+record.ref_id+'.json'),true);failState=false;assert.equal((await worker.fetch(request(record),e,{})).status,202);
});

test('definite callback unavailability retries email while a permanent rejection alerts without automatic resend',async t=>{
 const {default:worker,processRecord}=await import('../cloudflare/registration-intake/worker.mjs');const e=env(),record=make();await worker.fetch(request(record),e,{});const old=global.fetch;let organizer=0,alerts=0;
 global.fetch=async(url,options)=>{if(String(url).includes('telegram')){alerts++;return {ok:true,json:async()=>({ok:true})};}const stage=JSON.parse(options.body).stage;if(stage==='database')return {ok:true,json:async()=>({stored:true})};if(stage==='organizer'){organizer++;return {ok:true,json:async()=>({status:'failed',retryable:false})};}return {ok:false,status:503,json:async()=>({safe_to_retry:true})};};t.after(()=>global.fetch=old);
 await processRecord(e,record.ref_id,1000000);await processRecord(e,record.ref_id,2000000);const state=await (await e.INTAKE.get('pending/'+record.ref_id+'.json')).json();assert.equal(state.organizer,'failed');assert.equal(state.delegate,'pending');assert.equal(organizer,1);assert.equal(alerts,1);
});
