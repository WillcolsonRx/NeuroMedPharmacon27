const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const data=require('../conference-tracks.json');
const {renderTracks,validateTracks}=require('../scripts/render-tracks');

test('catalogue has ten ordered tracks, two chemistry tracks and one Indian indigenous-systems track',()=>{
 validateTracks();assert.equal(data.tracks.length,10);
 assert.equal(data.tracks.filter(t=>t.category==='chemistry').length,2);
 assert.equal(data.tracks.filter(t=>t.category==='indigenous').length,1);
 assert.equal(data.tracks.filter(t=>t.category==='cns').length,3);
});
test('every track submission link has an exactly matching abstract select option',()=>{
 const html=renderTracks(fs.readFileSync(require.resolve('../index.html'),'utf8'));
 const links=[...html.matchAll(/data-track="([^\"]+)"/g)].map(m=>m[1]);
 const start=html.indexOf('id="absCategory"');const end=html.indexOf('</select>',start);
 const options=[...html.slice(start,end).matchAll(/<option value="([^\"]+)"/g)].map(m=>m[1]);
 assert.equal(links.length,10);assert.equal(options.length,10);
 assert.deepEqual([...links].sort(),[...options].sort());
 assert.equal(new Set(links).size,10);
});
test('category filters display the correct tracks and abstract links preselect the chosen track',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 const start=html.indexOf('function filterTracks('),end=html.indexOf('// 4. SCHEDULE',start);
 const cards=data.tracks.map(t=>({style:{},getAttribute:()=>t.category}));
 const select={value:''};let scrolled=false;
 const context={document:{querySelectorAll:selector=>selector==='.track-card'?cards:[],getElementById:id=>id==='absCategory'?select:{scrollIntoView(){scrolled=true;}}}};
 vm.runInNewContext(html.slice(start,end),context);
 const button={classList:{add(){}}};
 context.filterTracks('chemistry',button);assert.equal(cards.filter(c=>c.style.display==='flex').length,2);
 context.filterTracks('cns',button);assert.equal(cards.filter(c=>c.style.display==='flex').length,3);
 context.filterTracks('all',button);assert.equal(cards.filter(c=>c.style.display==='flex').length,10);
 const track=`Track 08: ${data.tracks[7].title}`;context.openAbstractWithTrack(track);assert.equal(select.value,track);assert.equal(scrolled,true);
});

test('brochure refresh updates the track list without changing fees or contact details',()=>{
 const {renderBrochure}=require('../scripts/render-tracks');
 const text='Intro\nTrack 01: Retired topic\nOld description\n\nFEES: INR 3500\nCONTACT: secretariat@example.test';
 const updated=renderBrochure(text);
 assert.equal((updated.match(/Track \d{2}:/g)||[]).length,10);
 assert.ok(!updated.includes('Retired topic'));
 assert.ok(updated.endsWith('FEES: INR 3500\nCONTACT: secretariat@example.test'));
});
