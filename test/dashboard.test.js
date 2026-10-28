const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Secretariat document links reject executable URLs and escape filenames', () => {
  const source=fs.readFileSync(require.resolve('../public/secretariat.js'),'utf8');
  const start=source.indexOf('function fileLink('), end=source.indexOf('function renderRows',start);
  const context={escape:value=>String(value).replace(/</g,'&lt;').replace(/"/g,'&quot;')};
  vm.runInNewContext(source.slice(start,end),context);
  assert.equal(context.fileLink('javascript:alert(1)','Unsafe'),'');
  assert.match(context.fileLink('https://example.test/document','<script>'),/&lt;script>/);
  assert.ok(!source.includes('localStorage'));
});

test('fee calculator loads the backend tariff before enabling registration', async () => {
  const html = fs.readFileSync(require.resolve('../index.html'),'utf8');
  const start = html.indexOf('async function loadRegistrationTariff()');
  const code = html.slice(start,html.indexOf("window.addEventListener('load', loadRegistrationTariff)",start));
  const button = {};
  const context = {document:{getElementById:()=>button},fetch:async()=>({ok:true,json:async()=>({tier:'regular',all:{regular:{student:4000}}})}),TARIFF_DATA:{},currentTier:'early',registrationTariffReady:false,recalculateTariff(){},validatePaymentSubmissionState(){},console};
  await vm.runInNewContext(code+'\nloadRegistrationTariff();',context);
  assert.equal(context.currentTier,'regular');
  assert.equal(context.TARIFF_DATA.regular.student,4000);
  assert.equal(context.registrationTariffReady,true);
});

test('abstract form sends the selected Word file and reports incomplete email accurately',async()=>{
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  const start=html.indexOf('async function handleAbstractSubmit(');
  const code=html.slice(start,html.indexOf('// 9. SECRETARIAT ADMIN CONSOLE LOGIC',start));
  let eligible=true;
  const nodes={btnSubmitAbs:{},absRegistrationId:{value:'NMP27-DEL-12345'},absAuthor:{value:'Author'},absEmail:{value:'author@example.test'},absCategory:{value:'Track 1'},absTitle:{value:'Study'},absDocument:{files:[{name:'study.docx'}]},absPreference:{value:'Poster'},abstractForm:{reset(){eligible=false;}}};
  const alerts=[];let payload;
  const context={window:{AbstractRegistration:{isEligible:()=>eligible,reset(){eligible=false;},setSubmitting(value){nodes.btnSubmitAbs.disabled=value||!eligible;}}},isSubmittingAbstract:false,document:{getElementById:id=>nodes[id]},readSubmissionFile:async()=> 'data:test;base64,TEST',fetch:async(url,options)=>{assert.equal(url,'/api/abstract');payload=JSON.parse(options.body);return {ok:true,json:async()=>({ref_id:'ABS-TEST',email_status:{delegate:'failed',organizer:'sent'}})};},submissionEmailNotice:status=>status.delegate==='sent'?'sent':'incomplete',alert:msg=>alerts.push(msg),console};
  await vm.runInNewContext(code+'\nhandleAbstractSubmit({preventDefault(){}});',context);
  assert.equal(payload.registration_id,'NMP27-DEL-12345');
  assert.equal(payload.document_filename,'study.docx');
  assert.equal(payload.preference,'Poster');
  assert.equal(payload.document_data,'data:test;base64,TEST');
  assert.match(alerts[0],/incomplete/);
  assert.equal(nodes.btnSubmitAbs.disabled,true);
});
