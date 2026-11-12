const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {prepareIntake,receiveIntake}=require('../r2Intake');
const Reference=require('../public/registration-reference');
const {createAbstractEligibility}=require('../abstractEligibility');
const {InMemoryDb}=require('../dbFallback');
const token='test-token-'.repeat(4);
class Bucket{
 constructor(){this.data=new Map();this.version=0;}
 async get(key){const value=this.data.get(key);return value?{etag:value.etag,json:async()=>JSON.parse(value.text),text:async()=>value.text}:null;}
 async put(key,text,{onlyIf}={}){const old=this.data.get(key);if(onlyIf?.etagDoesNotMatch==='*'&&old||onlyIf?.etagMatches&&old?.etag!==onlyIf.etagMatches)return null;const value={text:String(text),etag:String(++this.version),uploaded:new Date()};this.data.set(key,value);return {etag:value.etag};}
 async delete(key){this.data.delete(key);}
 async list({prefix,limit=100,cursor}){const keys=[...this.data.keys()].filter(k=>k.startsWith(prefix)&&(!cursor||k>cursor)).sort().slice(0,limit);return {objects:keys.map(key=>({key,uploaded:new Date()})),truncated:false};}
}
const source=()=> 'NMP27-DEL-'+randomUUID().replaceAll('-','').toUpperCase();
const env=()=>({INTAKE:new Bucket(),INTAKE_TOKEN:token,RECOVERY_TOKEN:token,CALLBACK_TOKEN:token,CALLBACK_URL:'https://conference.example/api/internal/r2-registration',TELEGRAM_BOT_TOKEN:'test-only',TELEGRAM_CHAT_ID:'test-only',PROCESSING:{send:async()=>{}}});
const record=()=>prepareIntake({submission_id:randomUUID(),full_name:'Delegate',email:'delegate@example.test',affiliation:'Example University',category:'student',workshop:0,payment_ref:'DU12345',payment_proof:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII=',proof_filename:'proof.png'},{tier:'early',prices:{student:3500}});
const request=r=>new Request('https://worker.example/intake',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(r)});

test('R2 sequence starts at A1, advances durably, and assigns one number per retried submission',async()=>{
 const {allocateRegistrationNumber:allocate}=await import('../cloudflare/registration-intake/registration-numbers.mjs');
 const bucket=new Bucket(),first=source(),second=source();assert.equal(await allocate(bucket,first),'NMP27-A1');assert.equal(await allocate(bucket,first),'NMP27-A1');assert.equal(await allocate(bucket,second),'NMP27-A2');
 assert.equal((await (await bucket.get('registration-numbers/counter.json')).json()).next,3);
});

test('concurrent allocations never share a number and concurrent retries keep their original number',async()=>{
 const {allocateRegistrationNumber:allocate}=await import('../cloudflare/registration-intake/registration-numbers.mjs');const bucket=new Bucket();
 const safely=async id=>{for(let attempt=0;attempt<30;attempt++){try{return await allocate(bucket,id);}catch(e){if(!e.message.includes('busy'))throw e;}}throw Error('Allocation did not converge');};
 const ids=Array.from({length:15},source),numbers=await Promise.all(ids.map(safely));assert.equal(new Set(numbers).size,ids.length);
 const retries=await Promise.all(Array.from({length:15},()=>safely(ids[0])));assert.ok(retries.every(n=>n===numbers[0]));
 for(let i=0;i<ids.length;i++)assert.equal(await allocate(bucket,ids[i]),numbers[i]);
});

test('interrupted reservations are completed by later requests without losing or reusing a number',async()=>{
 const {allocateRegistrationNumber:allocate}=await import('../cloudflare/registration-intake/registration-numbers.mjs');
 for(const stage of ['mapping','counter-completion']){
  const bucket=new Bucket(),put=bucket.put.bind(bucket),first=source(),second=source();let fail=true;
  bucket.put=async(key,text,options)=>{if(fail&&((stage==='mapping'&&key.includes('/by-submission/'))||(stage==='counter-completion'&&key.endsWith('/counter.json')&&JSON.parse(text).pending===null))){fail=false;throw Error('Injected storage interruption');}return put(key,text,options);};
  await assert.rejects(allocate(bucket,first),/interruption/);assert.equal(await allocate(bucket,second),'NMP27-A2');assert.equal(await allocate(bucket,first),'NMP27-A1');
 }
});

test('same-submission allocation racing a completed reservation preserves the first mapping',async()=>{
 const {allocateRegistrationNumber:allocate}=await import('../cloudflare/registration-intake/registration-numbers.mjs');const bucket=new Bucket(),first=source(),get=bucket.get.bind(bucket);let inject=true;
 bucket.get=async key=>{const read=await get(key);if(inject&&key.includes('/by-submission/')){inject=false;await allocate(bucket,first);}return read;};
 assert.equal(await allocate(bucket,first),'NMP27-A1');assert.equal(await allocate(bucket,source()),'NMP27-A3'); // A2 consumed, never reassigned.
});

test('new Worker receipts return actual A-number IDs, deduplicate retries and protect immutable payment records',async()=>{
 const {default:worker}=await import('../cloudflare/registration-intake/worker.mjs');const e=env(),input=record();
 const fetchWorker=(_url,options)=>worker.fetch(new Request('https://worker.example/intake',options),e,{});
 const receipt=await receiveIntake(input,{url:'https://worker.example',token},fetchWorker);assert.equal(receipt.ref_id,'NMP27-A1');assert.equal(receipt.email_status.organizer,'queued');
 assert.equal((await receiveIntake(input,{url:'https://worker.example',token},fetchWorker)).ref_id,'NMP27-A1');
 assert.equal((await (await worker.fetch(request(record()),e,{})).json()).ref_id,'NMP27-A2');
 const stored=await (await e.INTAKE.get('records/NMP27-A1.json')).json();assert.equal(stored.submission_ref,input.ref_id);assert.equal(stored.payment_proof,input.payment_proof);
 assert.equal((await worker.fetch(request({...input,input_hash:'b'.repeat(64)}),e,{})).status,409);assert.equal((await (await e.INTAKE.get('records/NMP27-A1.json')).json()).input_hash,input.input_hash);
 assert.equal([...e.INTAKE.data.keys()].filter(k=>k.startsWith('records/')).length,2);
 await assert.rejects(receiveIntake(input,{url:'https://worker.example',token},async()=>({ok:true,json:async()=>({accepted:true,ref_id:'NMP27-A99',submission_ref:source()})})),/not be confirmed/);
});

test('pre-update R2 records and in-flight UUID retries keep their already-issued references',async()=>{
 const {default:worker}=await import('../cloudflare/registration-intake/worker.mjs');const e=env(),old=record();await e.INTAKE.put('records/'+old.ref_id+'.json',JSON.stringify(old));
 const response=await worker.fetch(request(old),e,{});assert.equal(response.status,202);assert.equal((await response.json()).ref_id,old.ref_id);assert.equal(await e.INTAKE.get('registration-numbers/counter.json'),null);
 assert.equal((await (await worker.fetch(request(record()),e,{})).json()).ref_id,'NMP27-A1');
});

test('numbered registration retries retain the number after processing-state storage fails',async()=>{
 const {default:worker}=await import('../cloudflare/registration-intake/worker.mjs');const e=env(),input=record(),put=e.INTAKE.put.bind(e.INTAKE);let fail=true;
 e.INTAKE.put=(key,...args)=>{if(fail&&key.startsWith('pending/'))throw Error('state storage unavailable');return put(key,...args);};
 assert.equal((await worker.fetch(request(input),e,{})).status,503);fail=false;assert.equal((await (await worker.fetch(request(input),e,{})).json()).ref_id,'NMP27-A1');
});

test('A-number registration verifies by the stored ID and same email; old formats remain accepted',async()=>{
 for(const ref of ['NMP27-A1','NMP27-A9999']){assert.equal(Reference.isValid(ref),true);assert.equal(Reference.isCompact(ref),false);assert.equal(Reference.display(ref),ref);}
 for(const invalid of ['NMP27-A0','NMP27-A01','NMP27-A-1'])assert.equal(Reference.isValid(invalid),false);
 const db=new InMemoryDb();db.tables.registrations.push({ref_id:'NMP27-A1',email:'delegate@example.test'});const verify=createAbstractEligibility(db);
 assert.equal((await verify({registration_id:'nmp27-a1',email:'delegate@example.test'})).registration_ref,'NMP27-A1');
 await assert.rejects(verify({registration_id:'NMP27-A1',email:'other@example.test'}),e=>e.status===403);
});

test('numbered records retain their ID in database replication and both real mail templates',async t=>{
 delete process.env.NODE_ENV;Object.assign(process.env,{SMTP_HOST:'numbered.example.test',SMTP_USER:'sender@example.test',SMTP_PASS:'test-only',ORGANIZER_EMAIL:'organizer@example.test'});
 const messages=[];t.mock.method(require('nodemailer'),'createTransport',()=>({sendMail:async m=>{messages.push(m);return {messageId:'test-only'};}}));
 const {processIntakeStage}=require('../r2RegistrationProcessor'),r={...record(),ref_id:'NMP27-A1'},calls=[];
 await processIntakeStage(r,'database',{request:async(...args)=>calls.push(args),rpc:async(...args)=>calls.push(args)});assert.equal(calls[1][1].p_record.ref_id,'NMP27-A1');assert.match(calls[0][0],/r2-intake\/NMP27-A1.png$/);
 for(const stage of ['organizer','delegate'])assert.equal((await processIntakeStage(r,stage)).status,'sent');
 assert.equal(messages.length,2);for(const mail of messages){assert.ok(mail.subject.includes('NMP27-A1'));assert.ok(mail.html.includes('NMP27-A1'));assert.ok(mail.text.includes('NMP27-A1'));}
});
