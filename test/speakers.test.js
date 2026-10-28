const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const speakers=require('../conference-speakers.json');
const {renderSpeakers}=require('../scripts/render-speakers');
test('speaker catalogue publishes sourced portraits and leaves unresolved profiles explicit',()=>{
 assert.equal(speakers.length,14);
 assert.equal(new Set(speakers.map(s=>s.id)).size,speakers.length);
 assert.equal(speakers.filter(s=>s.role==='Keynote Speaker').length,1);
 for(const s of speakers){
  if(s.profile_status==='verified'){
   assert.ok(s.designation&&s.affiliation&&s.image_source&&s.verified_on);
   assert.equal(new URL(s.profile_url).protocol,'https:');
   const file=path.join(__dirname,'..','public',s.image);
   assert.ok(fs.statSync(file).size>1000);
  }else{
   assert.equal(s.profile_status,'pending');assert.equal(s.image,null);
   assert.equal(s.designation,'');assert.equal(s.affiliation,'');
  }
 }
 const html=renderSpeakers(fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'));
 assert.equal((html.match(/data-speaker=/g)||[]).length,14);
 assert.ok(html.indexOf('id="tracks"')<html.indexOf('id="speakers"'));
 assert.ok(html.indexOf('id="speakers"')<html.indexOf('id="schedule"'));
 assert.ok(html.includes('Portrait and profile details will be updated soon.'));
 assert.equal(html,fs.readFileSync(path.join(__dirname,'..','public/index.html'),'utf8'));
});
