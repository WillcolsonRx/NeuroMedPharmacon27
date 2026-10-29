const {validatePaymentProofPayload}=require('./paymentValidator');
const {sendDelegateConfirmation,sendOrganizerNotification}=require('./mailer');
async function processIntakeStage(record,stage,storage) {
  if(!record || !/^NMP27-DEL-[A-F0-9]{32}$/.test(record.ref_id) || !/^[a-f0-9]{64}$/.test(record.input_hash))throw new Error('Invalid intake record');
  const proof=validatePaymentProofPayload(record.payment_proof,record.proof_filename);
  if(!proof.valid)throw new Error('Invalid stored payment proof');
  if(stage==='database'){
    if(!storage)throw new Error('Permanent database unavailable');
    const object='r2-intake/'+record.ref_id+'.'+proof.ext;
    await storage.request('/storage/v1/object/payment-proofs/'+object,{method:'POST',headers:{'Content-Type':proof.mimetype,'x-upsert':'true'},body:proof.buffer});
    const fields=['full_name','email','phone','affiliation','category','tier','workshop','amount','currency','ref_id','payment_ref','created_at','input_hash'];
    const row=Object.fromEntries(fields.map(k=>[k,record[k]]));
    Object.assign(row,{payment_proof:'supabase://payment-proofs/'+object,proof_filename:record.proof_filename,proof_mimetype:proof.mimetype,proof_size:proof.buffer.length,proof_uploaded_at:record.created_at});
    await storage.rpc('intake_registration_store',{p_record:row});
    return {stored:true};
  }
  if(!['organizer','delegate'].includes(stage))throw new Error('Invalid intake stage');
  const registration={...record,has_proof:true,proof_attachments:[{filename:record.proof_filename,content:proof.buffer,contentType:proof.mimetype}]};
  const result=await (stage==='organizer'?sendOrganizerNotification:sendDelegateConfirmation)(null,registration);
  return {status:result.uncertain ? 'needs_review' : result.status,retryable:result.retryable===true};
}
module.exports={processIntakeStage};
