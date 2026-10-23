const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('admin dashboard loads supported APIs and renders all tables', async () => {
  const html = fs.readFileSync(require.resolve('../public/admin.html'), 'utf8');
  const start = html.indexOf('    async function fetchDashboardData()');
  const code = html.slice(start, html.indexOf('    function renderRegistrations', start));
  const requests = [], rendered = [];
  const nodes = { adminToken: {value:'test-only'} };
  const context = {token:'',registrationsData:[],localStorage:{setItem(){}},document:{getElementById:id=>nodes[id] ||= {}},fetch:async url=>{
    requests.push(url);
    assert.match(url,/\/api\/admin\/(registrations|sponsorships|abstracts|mail-logs)\?/);
    return {ok:true,status:200,json:async()=>[]};
  },alert:msg=>assert.fail(msg),console,
  renderRegistrations:()=>rendered.push('registrations'),renderSponsorships:()=>rendered.push('sponsorships'),renderAbstracts:()=>rendered.push('abstracts'),renderMailLogs:()=>rendered.push('mail')};
  await vm.runInNewContext(code+'\nfetchDashboardData();',context);
  assert.equal(requests.length,4);
  assert.equal(rendered.length,4);
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
