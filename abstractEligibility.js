const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
function eligibilityError(status,message){const error=new Error(message);error.status=status;return error;}
function normalizeRegistrationPair(input={}){
 const ref=typeof input.registration_id==='string'?input.registration_id.trim().toUpperCase():'';
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 if(!/^NMP27-DEL-[A-Z0-9-]{5,64}$/.test(ref)||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw eligibilityError(400,'Enter your conference Registration ID and the email used for registration.');
 return {ref,email};
}
function createAbstractEligibility(db){
 const windows=new Map();
 async function limit(ip,email){
  const ipHash=hash('abstract-ip:'+ip),emailHash=hash('abstract-email:'+email);
  if(db.kind==='supabase'){
   const allowed=await db.rpc('abstract_registration_limit',{p_ip_hash:ipHash,p_email_hash:emailHash});
   if(allowed!==true&&allowed!==false)throw new Error('Invalid limit response');
   if(allowed===false)throw eligibilityError(429,'Too many registration checks. Try again in 15 minutes.');
   return;
  }
  const now=Date.now();
  for(const [key,value] of windows)if(value.until<=now)windows.delete(key);
  if(windows.size>10000)throw eligibilityError(429,'Too many registration checks. Try again later.');
  let allowed=true;
  for(const [key,max] of [[ipHash,300],[emailHash,20]]){
   const value=windows.get(key)||{count:0,until:now+15*60*1000};
   value.count++;windows.set(key,value);if(value.count>max)allowed=false;
  }
  if(!allowed)throw eligibilityError(429,'Too many registration checks. Try again in 15 minutes.');
 }
 return async function verify(input,ip='unknown'){
  const {ref,email}=normalizeRegistrationPair(input);
  try{
   await limit(ip,email);
   const rows=db.registrationByReference
    ? await db.registrationByReference(ref)
    : await db.prepare('SELECT ref_id,email FROM registrations WHERE ref_id = ? LIMIT 2').all(ref);
   if(!Array.isArray(rows)||rows.length!==1||rows[0].ref_id!==ref||String(rows[0].email).trim().toLowerCase()!==email)throw eligibilityError(403,'Registration ID and email do not match a completed conference registration.');
   return {registration_ref:rows[0].ref_id,email};
  }catch(error){
   if(error.status)throw error;
   throw eligibilityError(503,'Registration verification is temporarily unavailable. Please try again later or contact the Secretariat.');
  }
 };
}
module.exports={createAbstractEligibility,normalizeRegistrationPair};
