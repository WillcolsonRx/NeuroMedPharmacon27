'use strict';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={pending:'Pending',accepted_oral:'Accepted · Oral',accepted_poster:'Accepted · Poster',revision_requested:'Revision requested',rejected:'Rejected'};
const state={table:'abstracts',page:0,total:0,rows:[],selected:new Map(),previews:[],previewMessage:'',factorId:null,queuePage:0,queueTotal:0};
function notice(message){$('notice').textContent=message;}
async function api(path,body){
 const response=await fetch('/api/secretariat'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json();if(!response.ok)throw new Error(result.error || 'Request failed');return result;
}
function action(id,handler){$(id).addEventListener('click',async()=>{const button=$(id);button.disabled=true;try{await handler();}catch(e){notice(e.message);}finally{button.disabled=false;}});}
async function session(){
 const user=await api('/session');$('loginPanel').hidden=true;$('logout').hidden=false;$('account').textContent='Signed in as '+user.email;
 if(user.mfaRequired){$('mfaPanel').hidden=false;const {factors}=await api('/factors');state.factorId=factors[0]?.id;if(state.factorId)$('enrollHelp').textContent='Enter the code for '+(factors[0].friendly_name || 'your authenticator')+'.';$('enroll').hidden=Boolean(state.factorId);return;}
 $('mfaPanel').hidden=true;$('workspace').hidden=false;await loadRecords();const usage=await api('/usage');$('usage').textContent=`${usage.abstracts} abstracts · ${usage.registrations} registrations · ${(Number(usage.storageBytes)/1024/1024).toFixed(1)} MB of uploaded files. Check Supabase Usage against your plan; downloads also consume bandwidth.`;
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await api('/login',{email:$('email').value.trim(),password:$('password').value});$('password').value='';await session();notice('');}catch(error){notice(error.message);}finally{button.disabled=false;}});
action('enroll',async()=>{const factor=await api('/enroll',{});state.factorId=factor.id;$('setupKey').textContent=factor.secret;$('setup').hidden=false;$('enroll').hidden=true;});
$('mfaForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/verify',{factorId:state.factorId,code:$('code').value});$('code').value='';$('setupKey').textContent='';$('setup').hidden=true;await session();notice('');}catch(error){notice(error.message);}});
action('logout',async()=>{await api('/logout',{});location.reload();});
async function loadRecords(){
 const result=await api(`/records/${state.table}?page=${state.page}&status=${encodeURIComponent(state.table==='abstracts'?$('statusFilter').value:'')}`);
 state.rows=result.rows;state.total=result.total;$('recordsPanel').hidden=false;$('queuePanel').hidden=true;
 $('tableTitle').textContent={abstracts:'Abstract review',registrations:'Registrations',sponsorships:'Sponsorships',mail_logs:'Submission mail logs'}[state.table];
 $('filterLabel').hidden=state.table!=='abstracts';$('selectionActions').hidden=state.table!=='abstracts';
 $('pageInfo').textContent=`Page ${state.page+1} · ${result.total} records`;$('prev').disabled=state.page===0;$('next').disabled=(state.page+1)*25>=result.total;
 renderRows();
}
function fileLink(url,label){return url&&/^https:\/\//.test(url)?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`:'';}
function renderRows(){
 if(state.table==='abstracts'){
  $('recordHead').innerHTML='<tr><th>Select</th><th>Author / Reference</th><th>Abstract</th><th>Decision / internal notes</th><th>Save review</th></tr>';
  $('recordBody').innerHTML=state.rows.map(row=>`<tr><td><input type="checkbox" aria-label="Select ${escape(row.ref_id)}" data-select="${row.id}" ${state.selected.has(row.id)?'checked':''} ${row.decision==='pending'?'disabled':''}></td><td>${escape(row.full_name)}<br>${escape(row.email)}<br><strong>${escape(row.ref_id)}</strong><br><small>Registration: ${escape(row.registration_ref||'Legacy submission')}</small></td><td>${escape(row.title)}<br>${escape(row.category)}<br>${escape(row.preference)}<br>${fileLink(row.document_path,row.document_filename||'Word abstract')}${!row.document_path?`<details><summary>Legacy text</summary>${escape(row.body)}</details>`:''}</td><td><select data-decision="${row.id}" aria-label="Review decision">${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${row.decision===key?'selected':''}>${label}</option>`).join('')}</select><textarea data-notes="${row.id}" maxlength="4000" aria-label="Internal review notes">${escape(row.review_notes)}</textarea><small>Version ${row.decision_version||0}. Saving does not send mail.</small></td><td><button data-save="${row.id}">Save decision</button></td></tr>`).join('');
 }else if(state.table==='mail_logs'){
  $('recordHead').innerHTML='<tr><th>Recipient</th><th>Type / Reference</th><th>Status</th><th>Details</th></tr>';
  $('recordBody').innerHTML=state.rows.map(row=>`<tr><td>${escape(row.recipient)}</td><td>${escape(row.type)}<br>${escape(row.ref_id)}</td><td>${escape(row.status)}</td><td>${escape(row.error_msg || row.message_id)}</td></tr>`).join('');
 }else{
  $('recordHead').innerHTML='<tr><th>Name / Reference</th><th>Email</th><th>Category / Tier</th><th>Amount</th><th>Payment proof · requires bank verification</th></tr>';
  $('recordBody').innerHTML=state.rows.map(row=>`<tr><td>${escape(row.full_name||row.company_name)}<br>${escape(row.affiliation||'')}<br>${escape(row.ref_id)}</td><td>${escape(row.email)}</td><td>${escape(row.category||row.tier)}</td><td>INR ${Number(row.amount).toLocaleString('en-IN')}</td><td>${escape(row.payment_ref||'Unpaid inquiry')}<br>${fileLink(row.payment_proof,'Open proof')}</td></tr>`).join('');
 }
 updateSelection();
}
function updateSelection(){$('selectionCount').textContent=state.selected.size+' selected';}
$('recordBody').addEventListener('change',e=>{if(e.target.dataset.select){const id=Number(e.target.dataset.select);if(e.target.checked)state.selected.set(id,state.rows.find(row=>row.id===id));else state.selected.delete(id);updateSelection();}});
$('recordBody').addEventListener('click',async e=>{
 if(!e.target.dataset.save)return;const id=Number(e.target.dataset.save),row=state.rows.find(row=>row.id===id);e.target.disabled=true;
 try{await api('/review',{id,version:row.decision_version||0,decision:document.querySelector(`[data-decision="${id}"]`).value,notes:document.querySelector(`[data-notes="${id}"]`).value});state.selected.delete(id);await loadRecords();notice('Decision saved. No email has been sent.');}catch(error){e.target.disabled=false;notice(error.message+' Refresh records if another reviewer changed this abstract.');}
});
document.querySelectorAll('[data-table]').forEach(button=>button.addEventListener('click',async()=>{try{state.table=button.dataset.table;state.page=0;await loadRecords();}catch(e){notice(e.message);}}));
$('statusFilter').addEventListener('change',async()=>{try{state.page=0;await loadRecords();}catch(e){notice(e.message);}});
action('refresh',loadRecords);action('prev',async()=>{state.page=Math.max(0,state.page-1);await loadRecords();});action('next',async()=>{if((state.page+1)*25<state.total)state.page++;await loadRecords();});
action('selectPage',async()=>{for(const row of state.rows)if(row.decision!=='pending')state.selected.set(row.id,row);renderRows();});
action('clearSelection',async()=>{state.selected.clear();renderRows();});
function showPreview(){const item=state.previews[Number($('previewRecipient').value)||0];$('previewSubject').textContent=item.subject;$('emailPreview').srcdoc=item.html;}
action('preview',async()=>{
 if(!state.selected.size)throw Error('Select reviewed abstracts first.');
 state.previewMessage=$('campaignMessage').value;
 const result=await api('/preview',{ids:[...state.selected.keys()],message:state.previewMessage});state.previews=result.previews;
 $('previewRecipient').innerHTML=state.previews.map((item,index)=>`<option value="${index}">${escape(item.email)}</option>`).join('');
 $('previewCount').textContent=`${result.count} recipients. Check every decision and the instructions before queueing.`;$('previewPanel').hidden=false;showPreview();
});
$('previewRecipient').addEventListener('change',showPreview);
action('closePreview',async()=>{$('previewPanel').hidden=true;});
action('sendTest',async()=>{const item=state.previews[Number($('previewRecipient').value)||0];await api('/test-email',{id:item.id,message:state.previewMessage});notice('Test queued to your staff email. Resume delivery and check it before confirming the batch.');});
action('confirmCampaign',async()=>{
 if(!confirm(`Queue ${state.previews.length} decision emails? Confirm that you have checked the test email and all recipient decisions.`))return;
 const versions=Object.fromEntries(state.previews.map(item=>[item.id,item.version]));
 const result=await api('/campaign',{ids:state.previews.map(item=>item.id),versions,message:state.previewMessage,confirm:true});
 notice(`${result.queued} queued; ${result.alreadyQueued} already had a job. Delivery continues on the schedule, within the daily cap.`);$('previewPanel').hidden=true;state.selected.clear();await loadQueue();
});
async function loadQueue(){
 const result=await api('/queue?page='+state.queuePage);state.queueTotal=result.total;
 $('recordsPanel').hidden=true;$('queuePanel').hidden=false;
 $('queueSummary').textContent=`${result.settings.paused?'Delivery paused':'Delivery enabled'} · ${result.settings.attempts_today}/${result.settings.daily_limit} attempts used on ${result.settings.usage_day} (UTC). `+Object.entries(result.counts).map(([status,count])=>`${status}: ${count}`).join(' · ');
 $('queueBody').innerHTML=result.rows.map(row=>`<tr><td>${escape(row.ref_id)}</td><td>${escape(row.recipient)}</td><td>${escape(row.status)}${row.delivery_status?'<br>'+escape(row.delivery_status):''}</td><td>${row.attempts}</td><td>${escape(row.provider_id||row.last_error)}</td><td>${row.status==='queued'&&row.attempts===0?`<button data-cancel="${row.id}">Cancel unsent</button>`:''}${row.status==='needs_review'?`<button data-resolve="${row.id}">Reconcile with provider logs</button>`:''}${row.status==='failed'&&row.last_error!=='Cancelled by Secretariat'?`<button data-retry="${row.id}">Retry rejected attempt</button>`:''}</td></tr>`).join('');
 $('queuePageInfo').textContent=`Page ${state.queuePage+1} · ${result.total} jobs`;$('queuePrev').disabled=state.queuePage===0;$('queueNext').disabled=(state.queuePage+1)*25>=result.total;
}
action('queueTab',loadQueue);action('refreshQueue',loadQueue);action('queuePrev',async()=>{state.queuePage=Math.max(0,state.queuePage-1);await loadQueue();});action('queueNext',async()=>{if((state.queuePage+1)*25<state.queueTotal)state.queuePage++;await loadQueue();});
action('pauseQueue',async()=>{await api('/pause',{paused:true});await loadQueue();});action('resumeQueue',async()=>{await api('/pause',{paused:false});await loadQueue();});
$('queueBody').addEventListener('click',async e=>{const id=e.target.dataset.retry || e.target.dataset.cancel || e.target.dataset.resolve;if(!id)return;try{if(e.target.dataset.resolve){const evidence=prompt('After checking the provider logs or sender’s Sent folder, record what you found (at least 20 characters).');if(!evidence)return;const sent=confirm('Was this message definitely accepted/sent? OK marks sent. Cancel will offer a separate resend confirmation.');if(!sent&&!confirm('Have you verified that this message was NOT sent? Confirming requeues it and can send another email.'))return;await api('/resolve',{id,outcome:sent?'confirmed_sent':'confirmed_not_sent',evidence});await loadQueue();return;}await api(e.target.dataset.cancel?'/cancel':'/retry',{id});await loadQueue();}catch(error){notice(error.message);}});
session().catch(error=>{notice(error.message==='Please sign in'?'':error.message);});
