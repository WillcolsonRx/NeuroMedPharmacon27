'use strict';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={pending:'Pending',accepted_oral:'Accept · Oral',accepted_poster:'Accept · Poster',revision_requested:'Request revision',rejected:'Reject'};
const state={table:'abstracts',view:'records',page:0,total:0,rows:[],selected:new Map(),drafts:new Map(),cache:new Map(),templates:{},previews:[],single:null,previewMessage:'',factorId:null,queuePage:0,queueTotal:0,mailSettings:null,loadId:0,controller:null};
function notice(message){$('notice').textContent=message;}
async function api(path,body,options={}){
 const controller=new AbortController();const cancel=()=>controller.abort();
 options.signal?.addEventListener('abort',cancel,{once:true});if(options.signal?.aborted)controller.abort();
 const timer=setTimeout(cancel,options.timeout||20000);
 try{
  const response=await fetch('/api/secretariat'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
  const result=await response.json().catch(()=>({error:'The server returned an incomplete response. Please try again.'}));
  if(!response.ok)throw Object.assign(new Error(result.error||'Request failed'),{status:response.status});return result;
 }catch(error){if(error.name==='AbortError'&&!options.signal?.aborted)throw Error('The request took too long. Refresh to check its status before repeating a final decision.');throw error;}
 finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}
function failed(error){if(error.name!=='AbortError')notice(error.message);}
function navigation(){
 $('prev').disabled=state.page===0;$('next').disabled=(state.page+1)*25>=state.total;
 $('queuePrev').disabled=state.queuePage===0;$('queueNext').disabled=(state.queuePage+1)*25>=state.queueTotal;
}
function action(id,handler){$(id).addEventListener('click',async()=>{const button=$(id);button.disabled=true;try{await handler();}catch(e){failed(e);}finally{button.disabled=false;navigation();}});}
function invalidate(){state.cache.clear();}
function remember(key,data){if(state.cache.size>=20)state.cache.delete(state.cache.keys().next().value);state.cache.set(key,{at:Date.now(),data});}
function delivery(settings){
 if(settings)state.mailSettings=settings;
 const value=state.mailSettings;$('deliveryBanner').hidden=state.table!=='abstracts'||!value;
 if(!value)return;
 const used=value.usage_day===new Date().toISOString().slice(0,10)?Number(value.attempts_today):0;
 $('deliveryStatus').textContent=(value.paused?'Decision emails are paused. Enable delivery before finalizing.':'Decision email delivery enabled.')+` ${used}/${value.daily_limit} daily attempts used.`;
 $('enableDelivery').hidden=!value.paused;
 $('finalizeDecision').disabled=Boolean(value.paused);
}
function showTab(view){
 state.view=view;$('recordsPanel').hidden=view!=='records';$('queuePanel').hidden=view!=='queue';
 document.querySelectorAll('[data-table]').forEach(b=>b.setAttribute('aria-pressed',String(view==='records'&&b.dataset.table===state.table)));
 $('queueTab').setAttribute('aria-pressed',String(view==='queue'));
}
async function session(){
 const user=await api('/session');$('loginPanel').hidden=true;$('logout').hidden=false;$('account').textContent='Signed in as '+user.email;
 if(user.mfaRequired){$('mfaPanel').hidden=false;const {factors}=await api('/factors');state.factorId=factors[0]?.id;if(state.factorId)$('enrollHelp').textContent='Enter the code for '+(factors[0].friendly_name||'your authenticator')+'.';$('enroll').hidden=Boolean(state.factorId);return;}
 $('mfaPanel').hidden=true;$('workspace').hidden=false;await loadRecords();
 // Storage statistics are optional; never hold up the abstract review screen.
 loadUsage().catch(()=>{$('usage').textContent='Submission totals are temporarily unavailable. Review records remain available.';});
}
async function loadUsage(){const usage=await api('/usage');$('usage').textContent=`${usage.abstracts} abstracts · ${usage.registrations} registrations · ${(Number(usage.storageBytes)/1024/1024).toFixed(1)} MB of uploaded files.`;}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await api('/login',{email:$('email').value.trim(),password:$('password').value});$('password').value='';await session();notice('');}catch(error){failed(error);}finally{b.disabled=false;}});
action('enroll',async()=>{const factor=await api('/enroll',{});state.factorId=factor.id;$('setupKey').textContent=factor.secret;$('setup').hidden=false;$('enroll').hidden=true;});
$('mfaForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await api('/verify',{factorId:state.factorId,code:$('code').value});$('code').value='';$('setupKey').textContent='';$('setup').hidden=true;await session();notice('');}catch(error){failed(error);}finally{button.disabled=false;}});
action('logout',async()=>{await api('/logout',{});state.cache.clear();location.reload();});
action('refreshUsage',loadUsage);
async function loadRecords(force=false){
 const table=state.table,page=state.page,status=table==='abstracts'?$('statusFilter').value:'';
 const key=`${table}:${page}:${status}`;const ticket=++state.loadId;state.controller?.abort();state.controller=new AbortController();showTab('records');
 $('tableTitle').textContent={abstracts:'Abstract review',registrations:'Registrations',sponsorships:'Sponsorships',mail_logs:'Submission mail logs'}[table];
 $('filterLabel').hidden=table!=='abstracts';$('selectionActions').hidden=table!=='abstracts';
 $('tableHelp').textContent=table==='abstracts'?'Choose Oral, Poster, Revision or Rejection, preview the prepared letter, then finalize to send it. Internal notes are never included in the email.':'Submitted payment proofs require bank reconciliation. Open a file to generate a fresh private download link.';
 delivery();
 const paint=result=>{state.rows=result.rows;state.total=result.total;if(result.templates)state.templates=result.templates;delivery(result.mailSettings);$('pageInfo').textContent=`Page ${page+1} · ${result.total} records`;$('recordsLoading').hidden=true;renderRows();navigation();};
 const cached=state.cache.get(key);
 if(!force&&cached&&Date.now()-cached.at<15000){paint(cached.data);return;}
 $('recordsLoading').hidden=false;$('recordHead').replaceChildren();$('recordBody').replaceChildren();
 try{const result=await api(`/records/${table}?page=${page}&status=${encodeURIComponent(status)}`,undefined,{signal:state.controller.signal});if(ticket!==state.loadId)return;remember(key,result);paint(result);}
 finally{if(ticket===state.loadId)$('recordsLoading').hidden=true;}
}
function fileLink(row,table,label){
 const present=table==='abstracts'?row.document_path:row.payment_proof;
 return present?`<a href="/api/secretariat/files/${table}/${Number(row.id)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`:'';
}
function draftFor(row){const draft=state.drafts.get(row.id);if(draft&&draft.version===(row.decision_version||0))return draft;state.drafts.delete(row.id);return {id:row.id,version:row.decision_version||0,decision:row.decision,notes:row.review_notes||'',message:''};}
function mailLabel(row){const status=row.notification_status;return status?`<span class="badge status-${escape(status)}">Email: ${escape(status.replaceAll('_',' '))}</span>${row.delivery_status?`<small>${escape(row.delivery_status)}</small>`:''}${row.notification_error?`<small>${escape(row.notification_error)}</small>`:''}`:'<small>No decision email finalized.</small>';}
function renderRows(){
 if(state.table==='abstracts'){
  $('recordHead').innerHTML='<tr><th>Select</th><th>Author / Reference</th><th>Abstract</th><th>Decision and message</th><th>Finalize / Delivery</th></tr>';
  $('recordBody').innerHTML=state.rows.map(row=>{const draft=draftFor(row);return `<tr><td><input type="checkbox" aria-label="Select ${escape(RegistrationReference.display(row.ref_id))}" data-select="${row.id}" ${state.selected.has(row.id)?'checked':''} ${row.decision==='pending'?'disabled':''}></td><td>${escape(row.full_name)}<br>${escape(row.email)}<br><strong>${escape(RegistrationReference.display(row.ref_id))}</strong><br><small>Registration: ${escape(RegistrationReference.display(row.registration_ref)||'Legacy submission')}</small></td><td><strong>${escape(row.title)}</strong><br>${escape(row.category)}<br>Requested: ${escape(row.preference||'Oral Communication')}<br>${fileLink(row,'abstracts',row.document_filename||'Word abstract')}${!row.document_path?`<details><summary>Legacy text</summary>${escape(row.body)}</details>`:''}</td><td><select data-decision="${row.id}" aria-label="Final presentation decision">${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${draft.decision===key?'selected':''}>${label}</option>`).join('')}</select><details><summary>Ready message snippet</summary><p data-snippet="${row.id}">${escape(state.templates[draft.decision]?.message||'Select a decision to use its ready-made message.')}</p></details><label class="compact-label">Internal notes (not emailed)<textarea data-notes="${row.id}" maxlength="4000" rows="2">${escape(draft.notes)}</textarea></label><details><summary>Presenter instructions (optional)</summary><textarea data-message="${row.id}" maxlength="4000" rows="3" aria-label="Instructions included in decision email">${escape(draft.message)}</textarea></details></td><td><button data-preview="${row.id}">Preview &amp; finalize</button><button data-save="${row.id}" class="secondary">Save notes only</button><div class="delivery-state">${mailLabel(row)}</div></td></tr>`;}).join('');
 }else if(state.table==='mail_logs'){
  $('recordHead').innerHTML='<tr><th>Recipient</th><th>Type / Reference</th><th>Status</th><th>Details</th></tr>';
  $('recordBody').innerHTML=state.rows.map(row=>`<tr><td>${escape(row.recipient)}</td><td>${escape(row.type)}<br>${escape(RegistrationReference.display(row.ref_id))}</td><td>${escape(row.status)}</td><td>${escape(row.error_msg||row.message_id)}</td></tr>`).join('');
 }else{
  $('recordHead').innerHTML='<tr><th>Name / Reference</th><th>Email</th><th>Category / Tier</th><th>Amount</th><th>Payment proof</th></tr>';
  $('recordBody').innerHTML=state.rows.map(row=>`<tr><td>${escape(row.full_name||row.company_name)}<br>${escape(row.affiliation||'')}<br>${escape(RegistrationReference.display(row.ref_id))}</td><td>${escape(row.email)}</td><td>${escape(row.category||row.tier)}</td><td>INR ${Number(row.amount).toLocaleString('en-IN')}</td><td>${escape(row.payment_ref||'Unpaid inquiry')}<br>${fileLink(row,state.table,'Open proof')}</td></tr>`).join('');
 }
 if(!state.rows.length)$('recordBody').innerHTML='<tr><td colspan="5">No records in this view.</td></tr>';
 updateSelection();
}
function updateSelection(){$('selectionCount').textContent=state.selected.size+' selected';}
function capture(row){const draft={id:row.id,version:row.decision_version||0,decision:document.querySelector(`[data-decision="${row.id}"]`).value,notes:document.querySelector(`[data-notes="${row.id}"]`).value,message:document.querySelector(`[data-message="${row.id}"]`).value};state.drafts.set(row.id,draft);return draft;}
$('recordBody').addEventListener('input',e=>{const id=Number(e.target.dataset.notes||e.target.dataset.message);const row=state.rows.find(r=>r.id===id);if(row)capture(row);});
$('recordBody').addEventListener('change',e=>{
 if(e.target.dataset.select){const id=Number(e.target.dataset.select);if(e.target.checked)state.selected.set(id,state.rows.find(row=>row.id===id));else state.selected.delete(id);updateSelection();}
 if(e.target.dataset.decision){const row=state.rows.find(r=>r.id===Number(e.target.dataset.decision));const draft=capture(row);document.querySelector(`[data-snippet="${row.id}"]`).textContent=state.templates[draft.decision]?.message||'Select a decision to use its ready-made message.';}
});
function openPreview(single=false){$('previewTitle').textContent=single?'Review and finalize this decision':'Review selected decision emails';$('previewRecipientLabel').hidden=single;$('sendTest').hidden=single;$('confirmCampaign').hidden=single;$('finalizeDecision').hidden=!single;$('previewHelp').textContent=single?'Finalizing saves this decision and attempts its email immediately. Temporary failures remain in the tracked queue.':'Batch mail uses the scheduled queue. Check a test email before approving this batch.';$('previewPanel').hidden=false;if(!$('previewPanel').open)$('previewPanel').showModal();delivery();}
function closePreview(){$('previewPanel').close();$('previewPanel').hidden=true;state.single=null;}
function showPreview(){const item=state.previews[Number($('previewRecipient').value)||0];if(!item)return;$('previewSubject').textContent=item.subject;$('emailPreview').srcdoc=item.html;}
$('recordBody').addEventListener('click',async e=>{
 const id=Number(e.target.dataset.save||e.target.dataset.preview);if(!id)return;const row=state.rows.find(r=>r.id===id);const button=e.target;button.disabled=true;
 try{
  const draft=capture(row);
  if(button.dataset.save){const updated=await api('/review',{id,version:draft.version,decision:row.decision,notes:draft.notes});invalidate();row.review_notes=updated.review_notes;notice('Internal notes saved. Decision unchanged; no email sent.');return;}
  if(draft.decision==='pending')throw Error('Choose Oral, Poster, Revision or Rejection first.');
  const preview=await api('/decision-preview',{...draft});state.single={...draft};state.previews=[preview];$('previewRecipient').innerHTML='<option value="0"></option>';$('previewCount').textContent=`${preview.email} · ${labels[draft.decision]}`;openPreview(true);showPreview();
 }catch(error){failed(error);}finally{button.disabled=false;}
});
action('finalizeDecision',async()=>{
 if(!state.single)return;const draft={...state.single};$('finalizeDecision').textContent='Saving decision and sending…';
 try{
  const result=await api('/finalize',{...draft,confirm:true},{timeout:65000});invalidate();state.drafts.delete(draft.id);state.selected.delete(draft.id);
  const n=result.notification||result.job;const updated={...result.row,notification_id:n.id,notification_status:n.status,delivery_status:n.delivery_status,notification_error:n.last_error};
  if(state.view==='records'&&state.table==='abstracts'){
  state.rows=state.rows.map(r=>r.id===draft.id?updated:r);
  const filter=$('statusFilter').value;if(filter&&updated.decision!==filter){state.rows=state.rows.filter(r=>r.id!==draft.id);state.total=Math.max(0,state.total-1);}
  renderRows();navigation();}
  closePreview();
  notice(n.status==='sent'?'Decision finalized. The mail server accepted the decision email.':n.status==='needs_review'?'Decision finalized. Email outcome is uncertain: check provider logs before resending.':n.status==='failed'?'Decision finalized. Email was rejected; inspect the Decision email queue.':n.paused?'Decision finalized; email is safely queued, but delivery is paused.':n.dailyLimitReached?'Decision finalized; email is safely queued until the daily sending allowance resets.':n.warning||'Decision finalized; email is safely queued for retry.');
 }finally{$('finalizeDecision').textContent='Finalize decision & send email';}
});
document.querySelectorAll('[data-table]').forEach(button=>button.addEventListener('click',()=>{state.table=button.dataset.table;state.page=0;loadRecords().catch(failed);}));
$('statusFilter').addEventListener('change',()=>{state.page=0;loadRecords().catch(failed);});
action('refresh',()=>loadRecords(true));action('prev',async()=>{state.page=Math.max(0,state.page-1);await loadRecords();});action('next',async()=>{if((state.page+1)*25<state.total)state.page++;await loadRecords();});
action('enableDelivery',async()=>{await api('/pause',{paused:false});invalidate();delivery({...state.mailSettings,paused:false});notice('Decision email delivery enabled. Finalized decisions will be attempted immediately; queued mail can also resume.');});
action('selectPage',async()=>{for(const row of state.rows)if(row.decision!=='pending')state.selected.set(row.id,row);renderRows();});
action('clearSelection',async()=>{state.selected.clear();renderRows();});
action('preview',async()=>{
 if(!state.selected.size)throw Error('Select reviewed abstracts first.');state.single=null;state.previewMessage=$('campaignMessage').value;
 const result=await api('/preview',{ids:[...state.selected.keys()],message:state.previewMessage});state.previews=result.previews;
 $('previewRecipient').innerHTML=state.previews.map((item,index)=>`<option value="${index}">${escape(item.email)}</option>`).join('');$('previewCount').textContent=`${result.count} recipients. Check every decision and instruction before queueing.`;openPreview();showPreview();
});
$('previewRecipient').addEventListener('change',showPreview);action('closePreview',async()=>closePreview());
$('previewPanel').addEventListener('cancel',()=>{$('previewPanel').hidden=true;state.single=null;});
action('sendTest',async()=>{const item=state.previews[Number($('previewRecipient').value)||0];await api('/test-email',{id:item.id,message:state.previewMessage});notice('Test queued to your staff email. Enable delivery and check it before confirming the batch.');});
action('confirmCampaign',async()=>{
 if(!confirm(`Queue ${state.previews.length} decision emails? Confirm that you checked the test email and recipient decisions.`))return;
 const versions=Object.fromEntries(state.previews.map(item=>[item.id,item.version]));const result=await api('/campaign',{ids:state.previews.map(item=>item.id),versions,message:state.previewMessage,confirm:true});
 invalidate();notice(`${result.queued} queued; ${result.alreadyQueued} already had a job. Batch delivery follows the schedule and daily cap.`);closePreview();state.selected.clear();await loadQueue(true);
});
async function loadQueue(force=false){
 const ticket=++state.loadId;state.controller?.abort();state.controller=new AbortController();const page=state.queuePage,key='queue:'+page;showTab('queue');
 const paint=result=>{$('queuePageInfo').textContent=`Page ${page+1} · ${result.total} jobs`;state.queueTotal=result.total;state.mailSettings=result.settings;$('queueSummary').textContent=`${result.settings.paused?'Delivery paused':'Delivery enabled'} · ${result.settings.attempts_today}/${result.settings.daily_limit} attempts used on ${result.settings.usage_day} (UTC). `+Object.entries(result.counts).map(([status,count])=>`${status}: ${count}`).join(' · ');
 $('queueBody').innerHTML=result.rows.map(row=>`<tr><td>${escape(RegistrationReference.display(row.ref_id))}</td><td>${escape(row.recipient)}</td><td>${escape(row.status)}${row.delivery_status?'<br>'+escape(row.delivery_status):''}</td><td>${row.attempts}</td><td>${escape(row.provider_id||row.last_error)}</td><td>${row.status==='queued'&&row.attempts===0?`<button data-cancel="${row.id}">Cancel unsent</button>`:''}${row.status==='needs_review'?`<button data-resolve="${row.id}">Reconcile with provider logs</button>`:''}${row.status==='failed'&&row.last_error!=='Cancelled by Secretariat'?`<button data-retry="${row.id}">Retry rejected attempt</button>`:''}</td></tr>`).join('');navigation();};
 const cached=state.cache.get(key);if(!force&&cached&&Date.now()-cached.at<15000){paint(cached.data);return;}
 $('queueSummary').textContent='Loading delivery status…';$('queueBody').replaceChildren();const result=await api('/queue?page='+page,undefined,{signal:state.controller.signal});if(ticket!==state.loadId)return;remember(key,result);paint(result);
}
action('queueTab',()=>loadQueue());action('refreshQueue',()=>loadQueue(true));action('queuePrev',async()=>{state.queuePage=Math.max(0,state.queuePage-1);await loadQueue();});action('queueNext',async()=>{if((state.queuePage+1)*25<state.queueTotal)state.queuePage++;await loadQueue();});
action('pauseQueue',async()=>{await api('/pause',{paused:true});invalidate();await loadQueue(true);});action('resumeQueue',async()=>{await api('/pause',{paused:false});invalidate();await loadQueue(true);});
$('queueBody').addEventListener('click',async e=>{const id=e.target.dataset.retry||e.target.dataset.cancel||e.target.dataset.resolve;if(!id)return;const button=e.target;button.disabled=true;try{if(e.target.dataset.resolve){const evidence=prompt('After checking provider logs or Sent Mail, record what you found (at least 20 characters).');if(!evidence)return;const sent=confirm('Was this message definitely accepted/sent? OK marks sent. Cancel offers a separate resend confirmation.');if(!sent&&!confirm('Have you verified this message was NOT sent? Confirming requeues it and can send another email.'))return;await api('/resolve',{id,outcome:sent?'confirmed_sent':'confirmed_not_sent',evidence});}else await api(e.target.dataset.cancel?'/cancel':'/retry',{id});invalidate();await loadQueue(true);}catch(error){failed(error);}finally{button.disabled=false;}});
session().catch(error=>notice(error.message==='Please sign in'?'':error.message));
