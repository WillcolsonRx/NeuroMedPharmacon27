const {createHash,timingSafeEqual} = require('node:crypto');
const {validatePaymentRef,validatePaymentProofPayload} = require('./paymentValidator');
const {registrationAmount} = require('./public/registration-pricing');
function authorized(actual, secret) {
  if (!secret || secret.length < 32 || typeof actual !== 'string') return false;
  const a=Buffer.from(actual),b=Buffer.from('Bearer '+secret);
  return a.length===b.length && timingSafeEqual(a,b);
}
function intakeConfig(env=process.env) {
  if (!env.R2_INTAKE_URL && !env.R2_INTAKE_TOKEN) return null;
  const url=new URL(env.R2_INTAKE_URL);
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || !env.R2_INTAKE_TOKEN || env.R2_INTAKE_TOKEN.length<32) throw new Error('Invalid R2 intake configuration');
  return {url:url.origin,token:env.R2_INTAKE_TOKEN};
}
function prepareIntake(input,{tier,prices,now=new Date()}) {
  const bad=message=>{throw Object.assign(new Error(message),{status:400});};
  const text=(key,max,required=true)=>{
    const v=input[key];if(v==null && !required)return '';
    if(typeof v!=='string' || v.trim().length>(max) || (required && !v.trim()))bad('Invalid '+key.replaceAll('_',' '));
    return v.trim();
  };
  const id=text('submission_id',36);
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))bad('Reload the registration page before submitting.');
  const full_name=text('full_name',160),email=text('email',254).toLowerCase(),phone=text('phone',40,false),affiliation=text('affiliation',300);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || affiliation.length<2)bad('Valid email and affiliation are required.');
  if(![true,false,0,1].includes(input.workshop))bad('Invalid workshop selection');
  const ref=validatePaymentRef(input.payment_ref),proof=validatePaymentProofPayload(input.payment_proof,input.proof_filename);
  if(!ref.valid)bad(ref.error);if(!proof.valid)bad(proof.error);
  let amount;try{amount=registrationAmount({category:input.category,affiliation,workshop:Boolean(input.workshop)},prices);}catch(e){bad(e.message);}
  const payload={full_name,email,phone,affiliation,category:input.category,workshop:input.workshop?1:0,payment_ref:ref.sanitized,proof_filename:String(proof.original_filename || 'payment-proof.'+proof.ext).slice(0,180),proof_mimetype:proof.mimetype,proof_ext:proof.ext,proof_size:proof.buffer.length,payment_proof:'data:'+proof.mimetype+';base64,'+proof.buffer.toString('base64')};
  return {version:1,...payload,input_hash:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),ref_id:'NMP27-DEL-'+id.replaceAll('-','').toUpperCase(),tier,amount,currency:'INR',created_at:now.toISOString()};
}
async function receiveIntake(record,config,fetchImpl=fetch) {
  const response=await fetchImpl(config.url+'/intake',{method:'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify(record),signal:AbortSignal.timeout(20000)});
  if(response.status===409)throw Object.assign(new Error('This submission reference already has different details. Contact the Secretariat before submitting again.'),{status:409});
  if(!response.ok)throw Object.assign(new Error('Receipt could not be confirmed. Retry with the same form; do not pay again.'),{status:503});
  const data=await response.json();
  if(data.accepted!==true || data.ref_id!==record.ref_id)throw Object.assign(new Error('Receipt could not be confirmed. Retry with the same form.'),{status:503});
  return {ref_id:data.ref_id,tier:data.tier,amount:data.amount,currency:'INR',category:record.category,affiliation:record.affiliation,payment_ref:record.payment_ref,intake_status:'received',database_status:'pending',email_status:{delegate:'queued',organizer:'queued'}};
}
module.exports={authorized,intakeConfig,prepareIntake,receiveIntake};
