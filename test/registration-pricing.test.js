const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const pricing=require('../public/registration-pricing');
const prices={student:3500,faculty:4500,corporate:6000,workshop:500};

test('recognizes NIPER-Raebareli affiliation variants but rejects other institutions',()=>{
 for(const affiliation of ['NIPER-R','niper r','NIPER-Raebareli','NIPER RAE BARELI','National Institute of Pharmaceutical Education and Research, Raebareli','National Institute of Pharmaceutical Education & Research (Raebareli)','Department of Pharmacology, NIPER-Raebareli (Lucknow)','N.I.P.E.R., Raebareli'])assert.equal(pricing.isInHouseAffiliation(affiliation),true,affiliation);
 for(const affiliation of ['NIPER Mohali','NIPER Hyderabad','NIPER Raipur','NIPER','IIT Raebareli','National Institute of Pharmaceutical Education and Research, Mohali','Example University',''])assert.equal(pricing.isInHouseAffiliation(affiliation),false,affiliation);
});
test('registration totals use inclusive prices and enforce category and affiliation rules',()=>{
 assert.equal(pricing.registrationAmount({category:'student',affiliation:'Example University'},prices),3500);
 assert.equal(pricing.registrationAmount({category:'student',workshop:true,affiliation:'Example University'},prices),4000);
 assert.equal(pricing.registrationAmount({category:'inhouse_student',affiliation:'NIPER-R'},prices),2000);
 assert.equal(pricing.registrationAmount({category:'inhouse_student',workshop:1,affiliation:'NIPER-R'},prices),2500);
 assert.throws(()=>pricing.registrationAmount({category:'inhouse_student',affiliation:'NIPER Mohali'},prices),/require/);
 for(const category of ['workshop','constructor','__proto__'])assert.throws(()=>pricing.registrationAmount({category,affiliation:'NIPER-R'},prices),/Invalid delegate category/);
});
test('affiliation changes expose exactly four options and remove stale discounted selections',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');const start=html.indexOf('function recalculateTariff()'),end=html.indexOf('// Bank Details Copy Helper',start);
 const nodes={regCategory:{value:'student'},regAffiliation:{value:'Example University'},inHouseEligibility:{},regWorkshop:{checked:false},summaryBase:{},rowWorkshop:{style:{}},summaryWorkshop:{},summaryGrandTotal:{},paymentRemitNotice:{}};
 const context={document:{getElementById:id=>nodes[id]},RegistrationPricing:pricing,TARIFF_DATA:{early:prices},currentTier:'early'};
 vm.runInNewContext(html.slice(start,end),context);
 context.recalculateTariff();assert.equal((nodes.regCategory.innerHTML.match(/<option/g)||[]).length,3);assert.equal(nodes.summaryGrandTotal.textContent,'₹3,500');
 nodes.regAffiliation.value='NIPER-Raebareli';context.recalculateTariff();assert.equal((nodes.regCategory.innerHTML.match(/<option/g)||[]).length,4);
 nodes.regCategory.value='inhouse_student';context.recalculateTariff();assert.equal(nodes.summaryGrandTotal.textContent,'₹2,000');
 nodes.regAffiliation.value='Different University';context.recalculateTariff();assert.equal(nodes.regCategory.value,'student');assert.equal((nodes.regCategory.innerHTML.match(/<option/g)||[]).length,3);assert.equal(nodes.summaryGrandTotal.textContent,'₹3,500');
});
