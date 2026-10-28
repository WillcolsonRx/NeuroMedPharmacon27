const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const speakers=require('../conference-speakers.json');
const {renderSpeakers}=require('../scripts/render-speakers');
test('speaker catalogue publishes unique sourced portraits and omits unresolved profiles',()=>{
 assert.ok(speakers.length>=14);
 const published=speakers.filter(s=>['verified','organizer_confirmed'].includes(s.profile_status));
 assert.equal(new Set(speakers.map(s=>s.id)).size,speakers.length);
 assert.equal(speakers.filter(s=>s.role==='Keynote Speaker').length,1);
 for(const s of speakers){
  if(s.profile_status==='verified'){
   assert.ok(s.designation&&s.affiliation&&s.image_source&&s.verified_on);
   assert.equal(new URL(s.profile_url).protocol,'https:');
   const file=path.join(__dirname,'..','public',s.image);
   assert.ok(fs.statSync(file).size>1000);
  }else if(s.profile_status==='organizer_confirmed'){
   assert.ok(s.details_source&&s.designation&&s.affiliation);assert.equal(s.image,null);
  }else{
   assert.equal(s.profile_status,'pending');assert.equal(s.image,null);
   assert.equal(s.designation,'');assert.equal(s.affiliation,'');
  }
 }
 const html=renderSpeakers(fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'));
 assert.equal((html.match(/data-speaker=/g)||[]).length,published.length);
 for(const pending of speakers.filter(s=>s.profile_status==='pending')) assert.ok(!html.includes('data-speaker="'+pending.id+'"'));
 assert.equal(new Set(published.map(s=>s.name.toLowerCase().replace(/\b(dr|prof)\b/g,'').replace(/[^a-z]/g,''))).size,published.length);
 assert.ok(html.indexOf('id="tracks"')<html.indexOf('id="speakers"'));
 assert.ok(html.indexOf('id="speakers"')<html.indexOf('id="schedule"'));
 assert.ok(!html.includes('Portrait and profile details will be updated soon.'));
 assert.equal((html.match(/data-speaker="yk-gupta"/g)||[]).length,1);
 assert.equal((html.match(/data-speaker="ashutosh-kumar"/g)||[]).length,1);
 assert.ok(!html.includes('Photo forthcoming'));
 assert.ok(html.includes('/assets/speakers/ashutosh-kumar.jpg'));
 assert.ok(html.includes('/assets/speakers/shyam-sharma-selected.jpg'));
 assert.equal(html,fs.readFileSync(path.join(__dirname,'..','public/index.html'),'utf8'));
});
test('speaker order preserves the first two and then groups by designation',()=>{
 const html=renderSpeakers('<!-- SPEAKER_CARDS_START --><!-- SPEAKER_CARDS_END -->');
 const ids=Array.from(html.matchAll(/data-speaker="([^"]+)"/g),m=>m[1]);
 assert.deepEqual(ids.slice(0,2),['anil-gaikwad','anil-gulati']);
 assert.equal(ids[2],'yk-gupta');
 const before=(a,b)=>assert.ok(ids.indexOf(a)<ids.indexOf(b),a+' precedes '+b);
 before('yogesh-kulkarni','shyam-sharma');
 before('shyam-sharma','dhiraj-kabra');
 before('dhiraj-kabra','bn-srikumar');
 before('bn-srikumar','kanthi-kiran-kondepudi');
 before('mahendra-bishnoi','hemant-kumar');
 before('vinod-tiwari','ashok-jangra');
});
