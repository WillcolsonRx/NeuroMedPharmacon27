const crypto = require('node:crypto');
const express = require('express');
const COOKIE = '__Host-nmp_session';
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decisions = ['pending','accepted_oral','accepted_poster','revision_requested','rejected'];
const TEMPLATE_VERSION='2026-11-02';
const decisionTemplates={
 accepted_oral:{label:'Accepted for Oral Presentation',message:'We are pleased to inform you that your abstract has been accepted for an oral presentation at NeuroMet Pharmacon-2027. Please retain this letter and follow the presentation instructions provided by the Conference Secretariat. Abstract acceptance does not confirm registration or payment; please complete registration if outstanding.'},
 accepted_poster:{label:'Accepted for Poster Presentation',message:'We are pleased to inform you that your abstract has been accepted for a poster presentation at NeuroMet Pharmacon-2027. Please retain this letter and follow the poster preparation and presentation instructions provided by the Conference Secretariat. Abstract acceptance does not confirm registration or payment; please complete registration if outstanding.'},
 revision_requested:{label:'Revision Requested',message:'Thank you for submitting your abstract to NeuroMet Pharmacon-2027. The review team requests a revision before a final presentation decision can be made. Please follow the instructions below, or contact the Conference Secretariat for the requested changes.'},
 rejected:{label:'Abstract Not Selected',message:'Thank you for submitting your abstract to NeuroMet Pharmacon-2027. Following review, we regret to inform you that your abstract has not been selected for presentation. We appreciate your interest in the conference and the work you have shared with us.'}
};


function decisionEmail(job) {
  const data = job.snapshot;
  const modern=data.template_version===TEMPLATE_VERSION;
  const label = modern ? decisionTemplates[data.decision]?.label : {accepted_oral:'Accepted for Oral Presentation',accepted_poster:'Accepted for Poster Presentation',revision_requested:'Revision Requested',rejected:'Abstract Review Decision'}[data.decision];
  if (!label) throw new Error('Invalid review decision');
  const message = modern ? decisionTemplates[data.decision].message : data.decision.startsWith('accepted_')
    ? 'We are pleased to accept your abstract and welcome you to NeuroMet Pharmacon-2027. Please retain this confirmation and follow the Secretariat’s presentation instructions. Abstract acceptance does not confirm registration or payment; please complete registration if outstanding.'
    : data.decision === 'revision_requested' ? 'The review team requests a revision. Please follow the Secretariat’s instructions before submitting a revision.' : 'Thank you for your submission. Following review, your abstract has not been selected for presentation.';
  const subject = `${label}: NeuroMet Pharmacon-2027 [${data.ref_id}]`;
  const text = `Dear ${data.full_name},\n\n${message}\n\nAbstract: ${data.title}\nReference: ${data.ref_id}\nDecision: ${label}\n\n${data.message || ''}\n\n19–20 February 2027 · Post-conference workshop: 21 February 2027 · NIPER Raebareli, Lucknow Campus\nConference Secretariat`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" style="width:100%;max-width:600px;background:white;border:1px solid #e2e8f0;" cellpadding="24"><tr><td style="background:#060e18;color:white;border-bottom:4px solid #cba234;"><p style="color:#e2c477;">OFFICIAL ABSTRACT DECISION</p><h1 style="font-family:Georgia,serif;">NeuroMet Pharmacon-2027</h1></td></tr><tr><td><h2>${escape(label)}</h2><p>Dear ${escape(data.full_name)},</p><p style="line-height:1.7;">${escape(message)}</p><div style="padding:18px;background:#f8fafc;"><strong>${escape(data.ref_id)}</strong><p>${escape(data.title)}</p></div><p style="white-space:pre-wrap;line-height:1.7;">${escape(data.message || '')}</p><p>19–20 February 2027<br>Post-conference workshop: 21 February 2027<br>NIPER Raebareli, Lucknow Campus</p><p>Conference Secretariat</p></td></tr></table></td></tr></table></body></html>`;
  return {subject,text,html};
}

function createSecretariat({storage,fetchImpl=fetch,env=process.env}) {
  const router=express.Router();
  const service=async(path,options={})=>{
    const response=await fetchImpl(new URL(path,env.SUPABASE_URL),{...options,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,...options.headers},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Object.assign(new Error(response.status===429?'Too many requests. Please wait before trying again.':'Authentication failed'),{status:response.status===429?429:401});
    return response.status===204?{}:response.json();
  };
  const rpc=(name,args={})=>storage.rpc(name,args);
  const session=req=>{
    const item=(req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='));
    return item?.slice(COOKIE.length+1);
  };
  function setSession(res,token){res.setHeader('Set-Cookie',`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);}
  async function identity(req,requireMfa=true){
    const token=session(req);
    if(!token)throw Object.assign(new Error('Please sign in'),{status:401});
    const user=await service('/auth/v1/user',{headers:{Authorization:`Bearer ${token}`}});
    const members=await storage.request(`/rest/v1/secretariat_members?user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=user_id`);
    if(!members.length)throw Object.assign(new Error('Account is not approved for Secretariat access'),{status:403});
    // Claims are read only after Supabase verified this exact token via /user.
    const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
    if(requireMfa&&claims.aal!=='aal2')throw Object.assign(new Error('Authenticator verification required'),{status:403});
    return {id:user.id,email:user.email,token,aal:claims.aal,factors:user.factors || []};
  }
  router.use((req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','HEAD'].includes(req.method)){
      const origin=req.headers.origin;
      if(!env.APP_URL || origin!==new URL(env.APP_URL).origin)return res.status(403).json({error:'Request origin is not allowed'});
    }
    next();
  });
  const route=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){res.status(error.status || 503).json({error:error.status?error.message:'Secretariat service unavailable. Please retry later.'});}};
  router.post('/recover',route(async(req,res)=>{
    const email=String(req.body.email || '').trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254)return res.status(400).json({error:'Enter your staff email address'});
    const ip=String(req.headers['x-vercel-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0];
    const hash=value=>crypto.createHmac('sha256',env.SUPABASE_SERVICE_ROLE_KEY).update('recovery:'+value).digest('hex');
    if(!await rpc('secretariat_login_limit',{p_keys:[hash(ip),hash(email.toLowerCase())]}))return res.status(429).json({error:'Too many requests. Try again in 15 minutes.'});
    const redirect=new URL('/secretariat/reset',env.APP_URL).href;
    await service('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    res.json({message:'If this address has an account, a recovery email has been requested. Open only the newest link. Check spam as well.'});
  }));
  router.post('/recovery-session',route(async(req,res)=>{
    const token=req.body.accessToken;
    if(typeof token!=='string' || token.length>8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return res.status(400).json({error:'Invalid recovery link. Request a fresh email.'});
    req.headers.cookie=`${COOKIE}=${token}`;
    await identity(req,false);
    setSession(res,token);
    res.json({ok:true});
  }));
  router.get('/recovery-state',route(async(req,res)=>{
    const user=await identity(req,false);
    const factors=user.factors.filter(f=>f.factor_type==='totp'&&f.status==='verified');
    res.json({email:user.email,mfaRequired:factors.length>0&&user.aal!=='aal2',factorId:factors[0]?.id});
  }));
  router.post('/password',route(async(req,res)=>{
    const user=await identity(req,false);
    const hasMfa=user.factors.some(f=>f.factor_type==='totp'&&f.status==='verified');
    if(hasMfa&&user.aal!=='aal2')return res.status(403).json({error:'Verify your authenticator code before changing the password'});
    const password=req.body.password;
    if(typeof password!=='string'||password.length<12||password.length>128)return res.status(400).json({error:'Choose a new password between 12 and 128 characters'});
    try{await service('/auth/v1/user',{method:'PUT',headers:{Authorization:`Bearer ${user.token}`,'Content-Type':'application/json'},body:JSON.stringify({password})});}
    catch(error){if(error.status===429)throw error;return res.status(400).json({error:'Password could not be updated. Choose a different strong password, or request a fresh recovery email.'});}
    try{await service('/auth/v1/logout?scope=global',{method:'POST',headers:{Authorization:`Bearer ${user.token}`}});}catch{}
    res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    res.json({ok:true});
  }));
  router.post('/login',route(async(req,res)=>{
    const email=String(req.body.email || '').trim();
    const password=req.body.password;
    if(!email || typeof password!=='string' || password.length>256)return res.status(400).json({error:'Email and password required'});
    const ip=String(req.headers['x-vercel-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0];
    const hash=value=>crypto.createHmac('sha256',env.SUPABASE_SERVICE_ROLE_KEY).update(value).digest('hex');
    const allowed=await rpc('secretariat_login_limit',{p_keys:[hash(ip),hash(email.toLowerCase())]});
    if(!allowed)return res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});
    const auth=await service('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    // Approve account before issuing a browser session.
    req.headers.cookie=`${COOKIE}=${auth.access_token}`;
    await identity(req,false);
    setSession(res,auth.access_token);
    res.json({mfaRequired:true});
  }));
  router.post('/logout',route(async(req,res)=>{
    const token=session(req);
    if(token)await service('/auth/v1/logout',{method:'POST',headers:{Authorization:`Bearer ${token}`}});
    res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    res.json({ok:true});
  }));
  router.get('/session',route(async(req,res)=>{const user=await identity(req,false);res.json({email:user.email,mfaRequired:user.aal!=='aal2'});}));
  router.get('/factors',route(async(req,res)=>{
    const user=await identity(req,false);
    res.json({factors:(user.factors || []).filter(f=>f.factor_type==='totp'&&f.status==='verified').map(f=>({id:f.id,friendly_name:f.friendly_name}))});
  }));
  router.post('/enroll',route(async(req,res)=>{
    const user=await identity(req,false);
    const factor=await service('/auth/v1/factors',{method:'POST',headers:{Authorization:`Bearer ${user.token}`,'Content-Type':'application/json'},body:JSON.stringify({factor_type:'totp',friendly_name:`Conference ${Date.now()}`})});
    res.json({id:factor.id,secret:factor.totp.secret,uri:factor.totp.uri});
  }));
  router.post('/verify',route(async(req,res)=>{
    const user=await identity(req,false);
    const id=String(req.body.factorId || '');
    if(!/^[a-f0-9-]{36}$/i.test(id)||!/^\d{6}$/.test(req.body.code || ''))return res.status(400).json({error:'Valid factor and six-digit code required'});
    const headers={Authorization:`Bearer ${user.token}`,'Content-Type':'application/json'};
    const challenge=await service(`/auth/v1/factors/${id}/challenge`,{method:'POST',headers,body:'{}'});
    const verified=await service(`/auth/v1/factors/${id}/verify`,{method:'POST',headers,body:JSON.stringify({challenge_id:challenge.id,code:req.body.code})});
    setSession(res,verified.access_token);res.json({ok:true});
  }));
  router.use(async(req,res,next)=>{try{req.admin=await identity(req);next();}catch(error){res.status(error.status||503).json({error:error.message});}});
  router.get('/records/:table',route(async(req,res)=>{
    if(!['abstracts','registrations','sponsorships','mail_logs'].includes(req.params.table))return res.status(404).end();
    const page=Math.max(0,Number.parseInt(req.query.page,10)||0);
    const result=await rpc('secretariat_records',{p_table:req.params.table,p_page:page,p_limit:25,p_status:req.query.status || null});
    // Sign private files only when opened, not 25 times on every tab/page load.
    if(req.params.table==='abstracts')result.templates=decisionTemplates;
    res.json(result);
  }));
  router.get('/files/:table/:id',route(async(req,res)=>{
    const {table,id}=req.params;
    if(!['abstracts','registrations','sponsorships'].includes(table) || !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)))return res.status(404).end();
    const row=await rpc('secretariat_record',{p_table:table,p_id:Number(id)});
    const field=table==='abstracts'?'document_path':'payment_proof';
    const value=row?.[field];
    if(typeof value!=='string')return res.status(404).json({error:'File not found'});
    if(value.startsWith('data:') && table!=='abstracts'){
      const match=value.match(/^data:(image\/(?:png|jpeg|jpg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);
      if(!match || match[2].length>8*1024*1024)return res.status(404).end();
      const bytes=Buffer.from(match[2],'base64');
      if(!require('./paymentValidator').verifyMagicBytes(bytes,match[1]))return res.status(404).end();
      res.setHeader('Content-Type',match[1]);res.setHeader('Content-Disposition','attachment; filename="payment-proof.'+require('./paymentValidator').ALLOWED_MIME_TYPES[match[1]]+'"');return res.send(bytes);
    }
    const bucket=table==='abstracts'?'abstract-documents':'payment-proofs';
    if(!value.startsWith('supabase://'+bucket+'/'))return res.status(404).json({error:'Private file unavailable'});
    const [signed]=await storage.signRows([{[field]:value}]);
    const target=new URL(signed[field]);
    if(target.protocol!=='https:' || target.origin!==new URL(env.SUPABASE_URL).origin)throw Error('Invalid file destination');
    res.redirect(302,target.href);
  }));
  router.post('/decision-preview',route(async(req,res)=>{
    const {id,decision,version}=req.body;
    if(!Number.isSafeInteger(id)||!Number.isSafeInteger(version)||!Object.hasOwn(decisionTemplates,decision))return res.status(400).json({error:'Choose an abstract and a final decision'});
    const row=await rpc('secretariat_record',{p_table:'abstracts',p_id:id});
    if(!row)return res.status(404).json({error:'Abstract not found'});
    if(row.decision_version!==version)return res.status(409).json({error:'Review changed; reload before saving'});
    const snapshot={...row,decision,message:String(req.body.message||'').slice(0,4000),template_version:TEMPLATE_VERSION};
    res.json({id,version,email:row.email,...decisionEmail({snapshot})});
  }));
  router.post('/finalize',route(async(req,res)=>{
    const {id,decision,version}=req.body;
    if(!Number.isSafeInteger(id)||!Number.isSafeInteger(version)||!Object.hasOwn(decisionTemplates,decision)||req.body.confirm!==true)return res.status(400).json({error:'Preview and confirm a final decision'});
    const result=await rpc('secretariat_finalize',{p_id:id,p_decision:decision,p_notes:String(req.body.notes||'').slice(0,4000),p_message:String(req.body.message||'').slice(0,4000),p_actor:req.admin.id,p_version:version});
    let notification={...result.job};
    // Await the selected job inside this invocation, never a fragile background SMTP task.
    try{
      await processMailQueue({storage,fetchImpl,env,jobId:result.job.id,actor:req.admin.id});
      const current=await rpc('secretariat_notification',{p_id:result.job.id});
      notification={...(current.job||notification),paused:current.settings?.paused,dailyLimitReached:current.settings?.usage_day===new Date().toISOString().slice(0,10)&&current.settings?.attempts_today>=current.settings?.daily_limit};
    }catch{notification.warning='Decision saved and email retained in the queue. Check mail configuration or delivery status.';}
    res.json({...result,notification});
  }));
  router.post('/review',route(async(req,res)=>{
    if(!Number.isSafeInteger(req.body.id)||!decisions.includes(req.body.decision))return res.status(400).json({error:'Choose a valid abstract and decision'});
    res.json(await rpc('secretariat_review',{p_id:req.body.id,p_decision:req.body.decision,p_notes:String(req.body.notes || '').slice(0,4000),p_actor:req.admin.id,p_version:req.body.version}));
  }));
  router.post('/preview',route(async(req,res)=>{
    const rows=await rpc('secretariat_preview',{p_ids:req.body.ids});
    if(!rows.length)return res.status(400).json({error:'Select reviewed abstracts'});
    res.json({count:rows.length,previews:rows.map(snapshot=>({id:snapshot.id,version:snapshot.version,email:snapshot.email,...decisionEmail({snapshot:{...snapshot,message:String(req.body.message || '').slice(0,4000)}})}))});
  }));
  router.post('/test-email',route(async(req,res)=>{
    const rows=await rpc('secretariat_preview',{p_ids:[req.body.id]});
    if(!rows.length)return res.status(400).json({error:'Choose a reviewed abstract'});
    // Test delivery is restricted to this authenticated administrator's account.
    const snapshot={...rows[0],message:String(req.body.message || '').slice(0,4000)};
    const result=await rpc('secretariat_enqueue_test',{p_snapshot:snapshot,p_email:req.admin.email,p_actor:req.admin.id});
    res.json(result);
  }));
  router.post('/campaign',route(async(req,res)=>{
    if(req.body.confirm!==true)return res.status(400).json({error:'Preview and confirm recipients before queueing'});
    res.json(await rpc('secretariat_enqueue',{p_ids:req.body.ids,p_message:String(req.body.message || '').slice(0,4000),p_actor:req.admin.id,p_versions:req.body.versions}));
  }));
  router.get('/queue',route(async(req,res)=>res.json(await rpc('secretariat_queue',{p_page:Math.max(0,Number.parseInt(req.query.page,10)||0)}))));
  router.get('/usage',route(async(req,res)=>res.json(await rpc('secretariat_usage'))));
  router.post('/resolve',route(async(req,res)=>res.json(await rpc('secretariat_resolve',{p_id:req.body.id,p_outcome:req.body.outcome,p_evidence:String(req.body.evidence || '').slice(0,2000),p_actor:req.admin.id}))));
  router.post('/cancel',route(async(req,res)=>res.json(await rpc('secretariat_cancel',{p_id:req.body.id,p_actor:req.admin.id}))));
  router.post('/pause',route(async(req,res)=>{
    if(typeof req.body.paused!=='boolean')return res.status(400).json({error:'Choose pause or resume'});
    res.json(await rpc('secretariat_pause',{p_paused:req.body.paused,p_actor:req.admin.id}));
  }));
  router.post('/retry',route(async(req,res)=>res.json(await rpc('secretariat_retry',{p_id:req.body.id,p_actor:req.admin.id}))));
  return router;
}

async function processMailQueue({storage,fetchImpl=fetch,env=process.env,smtpTransport,jobId,actor}) {
  const provider=env.MAIL_PROVIDER || 'smtp';
  if(!['smtp','resend'].includes(provider))throw new Error('Unsupported mail provider');
  let transport=smtpTransport;
  if(provider==='resend' && (!env.RESEND_API_KEY || !env.MAIL_FROM))throw new Error('Configure Resend and a verified sender before starting mail delivery');
  if(provider==='smtp'){
    const mailer=require('./mailer');
    transport=transport || mailer.getTransporter();
    if(!transport)throw new Error('Configure SMTP before starting mail delivery');
  }
  const jobs=await storage.rpc(jobId?'secretariat_claim_one':'secretariat_claim',jobId?{p_id:jobId,p_actor:actor}:{p_limit:3});
  const results=[];
  for(const job of jobs){
    try{
      const content=decisionEmail(job);
      if(provider==='smtp'){
        try{
          const info=await transport.sendMail({from:env.MAIL_FROM || require('./mailer').getSmtpConfig().senderEmail,to:job.recipient,...content,...(env.MAIL_REPLY_TO?{replyTo:env.MAIL_REPLY_TO}:{})});
          const rejected=info.rejected?.length || (Array.isArray(info.accepted) && !info.accepted.length);
          await storage.rpc('secretariat_complete',{p_id:job.id,p_lease:job.lease_id,p_result:rejected?'failed':'sent',p_provider:info.messageId || null,p_error:rejected?'SMTP rejected recipient':null});
          results.push({id:job.id,status:rejected?'failed':'sent'});
        }catch(error){
          const definitive=Number(error.responseCode)>=400;
          const result=definitive?(Number(error.responseCode)<500?'retry':'failed'):'needs_review';
          await storage.rpc('secretariat_complete',{p_id:job.id,p_lease:job.lease_id,p_result:result,p_provider:null,p_error:definitive?`SMTP response ${error.responseCode}`:'SMTP outcome uncertain; inspect sent mail before resending'});
          results.push({id:job.id,status:result});
        }
        continue;
      }
      const response=await fetchImpl('https://api.resend.com/emails' ,{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`nmp-decision-${job.id}`},body:JSON.stringify({from:env.MAIL_FROM,to:[job.recipient],...content,...(env.MAIL_REPLY_TO?{reply_to:env.MAIL_REPLY_TO}:{})}),signal:AbortSignal.timeout(12000)});
      if(response.ok){const data=await response.json();if(!data.id)throw Error('Missing provider confirmation');await storage.rpc('secretariat_complete',{p_id:job.id,p_lease:job.lease_id,p_result:'sent',p_provider:data.id,p_error:null});results.push({id:job.id,status:'sent'});}
      else {const retry=[429,500,502,503,504].includes(response.status);await storage.rpc('secretariat_complete',{p_id:job.id,p_lease:job.lease_id,p_result:retry?'retry':'failed',p_provider:null,p_error:`Mail provider HTTP ${response.status}`});results.push({id:job.id,status:retry?'retry':'failed'});}
    }catch(error){
      // A timeout may follow acceptance. Reuse the same provider idempotency key.
      await storage.rpc('secretariat_complete',{p_id:job.id,p_lease:job.lease_id,p_result:provider==='smtp'?'needs_review':'retry',p_provider:null,p_error:provider==='smtp'?'SMTP outcome uncertain; inspect sent mail before resending':'Unconfirmed delivery attempt; retry uses the same idempotency key'});
      results.push({id:job.id,status:provider==='smtp'?'needs_review':'retry'});
    }
  }
  return results;
}
async function handleMailEvent({req,res,storage,env=process.env}) {
  const secret=env.RESEND_WEBHOOK_SECRET;
  const id=req.headers['svix-id'],timestamp=req.headers['svix-timestamp'],signatures=req.headers['svix-signature'];
  if(!secret || !id || !timestamp || !signatures || !Number.isFinite(Number(timestamp)) || Math.abs(Date.now()/1000-Number(timestamp))>300)return res.status(403).json({error:'Invalid event signature'});
  const expected=crypto.createHmac('sha256',Buffer.from(secret.replace(/^whsec_/,''),'base64')).update(`${id}.${timestamp}.`).update(req.body).digest();
  const valid=signatures.split(' ').some(signature=>{const [version,value]=signature.split(',');if(version!=='v1'||!value)return false;const actual=Buffer.from(value,'base64');return actual.length===expected.length&&crypto.timingSafeEqual(expected,actual);});
  if(!valid)return res.status(403).json({error:'Invalid event signature'});
  try{
    const event=JSON.parse(req.body.toString());
    const kind={'email.delivered':'delivered','email.bounced':'bounced','email.complained':'complained'}[event.type];
    if(kind && event.data?.email_id)await storage.rpc('secretariat_mail_event',{p_event:id,p_provider:event.data.email_id,p_kind:kind});
    res.json({ok:true});
  }catch{res.status(503).json({error:'Could not record mail event'});}
}
module.exports={createSecretariat,processMailQueue,decisionEmail,handleMailEvent,decisionTemplates};
