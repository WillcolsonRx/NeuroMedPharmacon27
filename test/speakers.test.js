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
 assert.equal(speakers.filter(s=>s.role==='Keynote Speaker').length,0);
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
 assert.ok(html.includes(speakers.find(s=>s.id==='ashutosh-kumar').image));
 assert.ok(html.includes('/assets/speakers/shyam-sharma-selected.jpg'));
 assert.equal(html,fs.readFileSync(path.join(__dirname,'..','public/index.html'),'utf8'));
});
test('published speakers follow the organizer sequence before previously listed extras',()=>{
 const html=renderSpeakers('<!-- SPEAKER_CARDS_START --><!-- SPEAKER_CARDS_END -->');
 const ids=Array.from(html.matchAll(/data-speaker="([^"]+)"/g),m=>m[1]);
 const expected=[
  'babul-bezbaruah','anil-gulati','yk-gupta','shyam-sharma','anil-gaikwad',
  'chandishwar-nath','gautam-palit','rakesh-dixit','jayantee-kalita','vgm-naidu',
  'dhiraj-kabra','yogesh-kulkarni','rajeev-taliyan','rahul-verma','syed-ziaur-rahman',
  'jiban-jyoti-panda','rajnish-kumar','chhuttan-lal-meena','mahendra-bishnoi',
  'hemant-kumar','manoj-dandekar','pragyanshu-khare','sudipta-raha-roy','dinesh-kumar',
  'karuna-shanker','kishor-mohanan','ashutosh-kumar','uma-shanker-navik',
  'abhinav-kanwal','vikas-mishra','mandeep-arora'
 ];
 assert.deepEqual(ids.slice(0,expected.length),expected);
 assert.deepEqual(ids.slice(expected.length),[
  'satyendra-rajput','bn-srikumar','kanthi-kiran-kondepudi','vinod-tiwari',
  'sachchidanand-tewari','ashok-jangra','priyanka-bajaj','ritesh-kumar','jayant-kumar'
 ]);
 assert.ok(!html.includes('speaker-keynote'));
 assert.equal(speakers.find(s=>s.id==='anil-gaikwad').role,'Invited Speaker');
});
