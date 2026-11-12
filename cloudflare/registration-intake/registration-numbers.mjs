// R2 ETag compare-and-swap serializes allocations across Worker instances.
// A durable pending reservation can be finished by any later invocation.
// The immutable mapping keeps retries on their original number; numbers are never reused.
const counterKey='registration-numbers/counter.json';
const assignmentKey=source=>'registration-numbers/by-submission/'+source+'.json';
const validSource=/^NMP27-DEL-[A-F0-9]{32}$/;
const validNumber=/^NMP27-A[1-9][0-9]{0,9}$/;
async function mapping(bucket,source){
 const obj=await bucket.get(assignmentKey(source));if(!obj)return null;
 const saved=await obj.json();
 if(saved.submission_ref!==source||!validNumber.test(saved.ref_id))throw Error('Invalid registration number mapping');
 return saved;
}
async function finish(bucket,state,etag){
 const pending=state.pending;
 if(!validSource.test(pending.submission_ref)||pending.ref_id!=='NMP27-A'+state.next)throw Error('Invalid registration reservation');
 const put=await bucket.put(assignmentKey(pending.submission_ref),JSON.stringify(pending),{onlyIf:{etagDoesNotMatch:'*'}});
 const assigned=put?pending:await mapping(bucket,pending.submission_ref);
 if(!assigned)throw Error('Registration number not durable');
 // If a concurrent retry already has an earlier number, consume this reservation
 // as a gap. Never overwrite the original mapping or hand its number to someone else.
 await bucket.put(counterKey,JSON.stringify({next:state.next+1,pending:null}),{onlyIf:{etagMatches:etag}});
 return assigned;
}
export async function allocateRegistrationNumber(bucket,source){
 if(!validSource.test(source))throw Error('Invalid submission reference');
 const existing=await mapping(bucket,source);if(existing)return existing.ref_id;
 for(let attempt=0;attempt<6;attempt++){
  const obj=await bucket.get(counterKey),state=obj?await obj.json():{next:1,pending:null};
  if(!Number.isSafeInteger(state.next)||state.next<1||state.next>9999999999)throw Error('Registration counter unavailable');
  if(state.pending){const assigned=await finish(bucket,state,obj.etag);if(assigned.submission_ref===source)return assigned.ref_id;continue;}
  const reservation={submission_ref:source,ref_id:'NMP27-A'+state.next};
  const reserved=await bucket.put(counterKey,JSON.stringify({...state,pending:reservation}),{onlyIf:obj?{etagMatches:obj.etag}:{etagDoesNotMatch:'*'}});
  if(!reserved)continue;
  return (await finish(bucket,{...state,pending:reservation},reserved.etag)).ref_id;
 }
 throw Error('Registration allocator busy; retry the same submission');
}
