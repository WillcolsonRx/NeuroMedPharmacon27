const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {jsPDF}=require('jspdf');
const {createSponsorshipProspectusPDF,generateSponsorshipProspectusPDF}=require('../scripts/generate-sponsorship-pdf');

test('prospectus retains commercial and voluntary terms while removing bank instructions and updating public contact',()=>{
 const calls=[],images=[];
 function PDF(options){const doc=new jsPDF(options),text=doc.text.bind(doc),add=doc.addImage.bind(doc);doc.text=(value,x,y,options={})=>{
  const lines=Array.isArray(value)?value:[String(value)],size=doc.getFontSize();
  for(let i=0;i<lines.length;i++){const width=doc.getTextWidth(lines[i]),left=options.align==='right'?x-width:options.align==='center'?x-width/2:x;calls.push({value:lines[i],left,right:left+width,y:y+i*size*.352778*(options.lineHeightFactor||doc.getLineHeightFactor()),page:doc.getCurrentPageInfo().pageNumber});}
  return text(value,x,y,options);
 };doc.addImage=(...args)=>{images.push(args);return add(...args);};return doc;}
 const doc=createSponsorshipProspectusPDF({PDF}),text=calls.map(c=>c.value).join(' ');
 assert.equal(doc.getNumberOfPages(),2);assert.equal(images.length,4);assert.ok(doc.getFontList().GuidelinesSans.includes('bold'));
 assert.match(text,/neurometpharmacon27@gmail\.com/);assert.doesNotMatch(text,/neuromedpharmacon26|Bank Wire|NEFT|RTGS|IFSC|SBIN0011214|NIPER-Raebareli Conferences/i);
 for(const phrase of ['INR 1,00,000 + 18% GST','INR 50,000 + 18% GST','INR 25,000 + 18% GST','two complimentary registrations','no display booth','Philanthropic support','one lunch and one dinner','without commercial deliverables','Delegate registration is separate','50% advance payment','30 days','octanorm','5A power socket'])assert.ok(text.includes(phrase),phrase);
 for(const c of calls){assert.ok(c.left>=17.5&&c.right<=192.5,JSON.stringify(c));assert.ok(c.y>=10&&c.y<=294,JSON.stringify(c));if(c.y<267)assert.ok(c.y<=260,JSON.stringify(c));}
 const grouped=new Map();for(const c of calls.filter(c=>c.page===2&&c.y<130)){const rows=grouped.get(c.y)||[];rows.push(c);grouped.set(c.y,rows);}
 assert.ok([...grouped.values()].some(rows=>rows.length>6&&Math.abs(rows.at(-1).right-192)<.1));
});
test('current and legacy sponsorship downloads are identical and website links bypass the old PDF cache',t=>{
 const targetDir=fs.mkdtempSync(path.join(os.tmpdir(),'nmp-sponsorship-'));t.after(()=>fs.rmSync(targetDir,{recursive:true,force:true}));
 const current=generateSponsorshipProspectusPDF({targetDir}),legacy=path.join(targetDir,'IPS_NorthZone_Sponsorship_Prospectus_2027.pdf');assert.deepEqual(fs.readFileSync(current),fs.readFileSync(legacy));
 const html=fs.readFileSync('index.html','utf8');assert.equal(html,fs.readFileSync('public/index.html','utf8'));assert.match(html,/Sponsorship_Prospectus\.pdf\?v=20261112-sponsorship/);assert.ok(!html.includes('wire transfer coordinates'));
});
