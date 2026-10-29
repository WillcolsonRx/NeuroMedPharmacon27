import {recoveryHTML,recoveryJS} from './recovery.mjs';
// R2 is the durable source; the cron scans records, not expiring queue messages.
const REF=/^NMP27-DEL-[A-F0-9]{32}$/;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function auth(request,token) {
  if(!token || token.length<32)return false;
  const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const a=await digest(request.headers.get('Authorization') || ''),b=await digest('Bearer '+token);
  return a.reduce((diff,v,i)=>diff|(v^b[i]),0)===0;
}
async function readJSON(request,max=300000) {
  const reader=request.body?.getReader();if(!reader)throw new Error('body');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Error('size');}chunks.push(value);}
  const bytes=new Uint8Array(size);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const key=id=>'records/'+id+'.json';
const stateKey=id=>'pending/'+id+'.json';
async function stateFor(env,id){const obj=await env.INTAKE.get(stateKey(id)) || await env.INTAKE.get('completed/'+id+'.json');return obj?{value:await obj.json(),etag:obj.etag}:{value:{database:'pending',organizer:'pending',delegate:'pending',attempts:0,next:0},etag:null};}
async function saveState(env,id,state,etag){return env.INTAKE.put(stateKey(id),JSON.stringify(state),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});}
async function callback(env,record,stage){
  const base=new URL(env.CALLBACK_URL);if(base.protocol!=='https:')throw new Error('config');
  const r=await fetch(base,{method:'POST',headers:{Authorization:'Bearer '+env.CALLBACK_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({record,stage}),signal:AbortSignal.timeout(40000)});
  if(!r.ok){const body=await r.json().catch(()=>({}));throw Object.assign(new Error('callback'),{safeToRetry:[401,404].includes(r.status)||body.safe_to_retry===true});}return r.json();
}
async function alertFailure(env,id,state){
  if(!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)return false;
  const r=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:'Conference registration needs attention: '+id+'\nDatabase: '+state.database+'; Secretariat mail: '+state.organizer+'; delegate mail: '+state.delegate+'\nRetrieve the private R2 record. Do not ask the delegate to pay/register again.'}),signal:AbortSignal.timeout(8000)});
  return r.ok && (await r.json()).ok===true;
}
export async function processRecord(env,id,now=Date.now()){
  const loaded=await stateFor(env,id);let s=loaded.value;
  if(s.next>now)return;
  if(s.database==='stored' && s.organizer==='sent' && s.delegate==='sent'){await env.INTAKE.put('completed/'+id+'.json',JSON.stringify(s));await env.INTAKE.delete(stateKey(id));return;}
  // A previous mail invocation may have sent before crashing. Never blindly resend.
  for(const who of ['organizer','delegate'])if(s[who]==='sending')s[who]='needs_review';
  s={...s,attempts:s.attempts+1,next:now+180000};
  let claim=await saveState(env,id,s,loaded.etag);if(!claim)return;
  let etag=claim.etag;
  const persist=async()=>{const saved=await saveState(env,id,s,etag);if(!saved)throw new Error('lease lost');etag=saved.etag;};
  try{
    const obj=await env.INTAKE.get(key(id));if(!obj)throw new Error('missing record');const record=await obj.json();
    if(s.database!=='stored'){
      try{const r=await callback(env,record,'database');s.database=r.stored===true?'stored':'pending';}catch{s.database='pending';}
      await persist();
    }
    // Email still attempted if Supabase is unavailable: its source is the R2 record.
    for(const who of ['organizer','delegate']){
      if(s[who]!=='pending')continue;
      s[who]='sending';await persist();
      try{
        const r=await callback(env,record,who);
        s[who]=r.status==='sent'?'sent':r.retryable===true?'pending':r.status==='not_configured'?'pending':r.status==='needs_review'?'needs_review':'failed';
      }catch(error){s[who]=error.safeToRetry?'pending':'needs_review';}
      await persist();
    }
    const problem=s.database!=='stored' || s.organizer!=='sent' || s.delegate!=='sent';
    if(problem && (!s.last_alert || now-s.last_alert>86400000)){
      try{if(await alertFailure(env,id,s))s.last_alert=now;}catch{/* pending alert retried at next sweep */}
    }
    s.next=now+Math.min(6*3600000,60000*2**Math.min(s.attempts,8));
    s.updated_at=new Date(now).toISOString();await persist();
    if(!problem){await env.INTAKE.put('completed/'+id+'.json',JSON.stringify(s));await env.INTAKE.delete(stateKey(id));}
  }catch{ // Record remains immutable; a later sweep reclaims the expired processing lease.
    console.error('R2 intake processing interrupted',id);
  }
}
export async function sweep(env){
  const cursorObj=await env.INTAKE.get('maintenance/cursor');const cursor=cursorObj?await cursorObj.text():undefined;
  const page=await env.INTAKE.list({prefix:'pending/',limit:2,...(cursor?{cursor}:{})});
  for(const obj of page.objects){const id=obj.key.slice(8,-5);if(REF.test(id))await processRecord(env,id);}
  await env.INTAKE.put('maintenance/cursor',page.truncated?page.cursor:'');
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET' && ['/recovery','/recovery.js'].includes(url.pathname))return new Response(url.pathname==='/recovery'?recoveryHTML:recoveryJS,{headers:{'Content-Type':url.pathname==='/recovery'?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; style-src 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
    if(request.method==='POST' && url.pathname==='/recovery/retry'){
      if(!await auth(request,env.RECOVERY_TOKEN))return json({error:'Unauthorized'},401);
      let body;try{body=await readJSON(request,3000);}catch{return json({error:'Invalid request'},400);}
      if(!REF.test(body.ref_id) || !['organizer','delegate'].includes(body.recipient) || body.confirmed_not_sent!==true || typeof body.evidence!=='string' || body.evidence.trim().length<20 || body.evidence.length>1000)return json({error:'Review evidence required'},400);
      const loaded=await stateFor(env,body.ref_id);
      if(!loaded.etag || !['failed','needs_review'].includes(loaded.value[body.recipient]))return json({error:'Reload this registration before retrying'},409);
      await env.INTAKE.put('audit/'+body.ref_id+'/'+crypto.randomUUID()+'.json',JSON.stringify({action:'reviewed retry',recipient:body.recipient,evidence:body.evidence,at:new Date().toISOString()}));
      loaded.value[body.recipient]='pending';loaded.value.next=0;
      if(!await saveState(env,body.ref_id,loaded.value,loaded.etag))return json({error:'State changed; reload'},409);
      if(env.PROCESSING)try{await env.PROCESSING.send({ref_id:body.ref_id});}catch{}
      return json({queued:true});
    }
    if(request.method==='POST' && url.pathname==='/intake'){
      if(!await auth(request,env.INTAKE_TOKEN))return json({error:'Unauthorized'},401);
      if(!env.CALLBACK_URL || !env.CALLBACK_TOKEN || env.CALLBACK_TOKEN.length<32 || !env.RECOVERY_TOKEN || env.RECOVERY_TOKEN.length<32 || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)return json({error:'Intake setup incomplete'},503);
      let record;try{record=await readJSON(request);}catch{return json({error:'Invalid submission'},400);}
      if(!REF.test(record.ref_id) || !/^[a-f0-9]{64}$/.test(record.input_hash) || record.version!==1 || typeof record.payment_proof!=='string' || record.payment_proof.length>280000 || !Number.isFinite(record.amount))return json({error:'Invalid submission'},400);
      try{
        const saved=await env.INTAKE.put(key(record.ref_id),JSON.stringify(record),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
        if(!saved){const existing=await env.INTAKE.get(key(record.ref_id));if(!existing)return json({error:'Retry'},503);const original=await existing.json();if(original.input_hash!==record.input_hash)return json({error:'Submission changed'},409);record=original;}
        const initial=await stateFor(env,record.ref_id);
        if(!initial.etag){const initialized=await saveState(env,record.ref_id,initial.value,null);if(!initialized)throw new Error('State initialization failed');}
        // Queue processing has its own lifecycle; cron recovers enqueue failures/expired messages.
        if(env.PROCESSING)try{await env.PROCESSING.send({ref_id:record.ref_id});}catch{console.error('Intake queued for scheduled recovery',record.ref_id);}
        return json({accepted:true,ref_id:record.ref_id,tier:record.tier,amount:record.amount},202);
      }catch{return json({error:'Durable receipt unavailable; retry the same submission'},503);}
    }
    // Private recovery API: separate read credential; never put tokens in URLs.
    if(request.method==='GET' && url.pathname.startsWith('/recovery/')){
      if(!await auth(request,env.RECOVERY_TOKEN))return json({error:'Unauthorized'},401);
      if(url.pathname==='/recovery/records'){
        const page=await env.INTAKE.list({prefix:'records/',limit:20,...(url.searchParams.get('cursor')?{cursor:url.searchParams.get('cursor')}:{})});
        const records=[];for(const obj of page.objects){const id=obj.key.slice(8,-5);records.push({ref_id:id,received_at:obj.uploaded,state:(await stateFor(env,id)).value});}
        return json({records,cursor:page.truncated?page.cursor:null});
      }
      if(!url.pathname.startsWith('/recovery/records/'))return json({error:'Not found'},404);
      const id=url.pathname.slice('/recovery/records/'.length);
      if(REF.test(id)){const obj=await env.INTAKE.get(key(id));if(!obj)return json({error:'Not found'},404);return json({record:await obj.json(),state:(await stateFor(env,id)).value});}
      return json({error:'Not found'},404);
    }
    return json({error:'Not found'},404);
  },
  async queue(batch,env){
    for(const message of batch.messages){
      const id=message.body?.ref_id;if(!REF.test(id)){message.ack();continue;}
      await processRecord(env,id);
      const state=(await stateFor(env,id)).value;
      if(state.database!=='stored' || state.organizer==='pending' || state.delegate==='pending')message.retry({delaySeconds:300});else message.ack();
    }
  },
  scheduled(event,env,ctx){ctx.waitUntil(sweep(env));}
};
