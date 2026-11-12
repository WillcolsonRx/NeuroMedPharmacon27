const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {jsPDF}=require('jspdf');
const {createGuidelinesPDF,createTemplatePDF,generateAbstractGuidelinesPDF}=require('../scripts/generate-guidelines-pdf');
const {tracks}=require('../conference-tracks.json');
function recorder(){
 const calls=[];
 function PDF(options){const doc=new jsPDF(options),text=doc.text.bind(doc);doc.text=(value,x,y,options={})=>{
  const lines=Array.isArray(value)?value:[String(value)],size=doc.getFontSize();
  for(let i=0;i<lines.length;i++){
   const width=doc.getTextWidth(lines[i]),left=options.align==='right'?x-width:options.align==='center'?x-width/2:x;
   calls.push({text:lines[i],page:doc.getCurrentPageInfo().pageNumber,left,right:left+width,y:y+i*size*.352778*(options.lineHeightFactor||doc.getLineHeightFactor()),size});
  }return text(value,x,y,options);
 };return doc;}
 return {PDF,calls};
}
test('guidelines preserve all ten tracks, key instructions and dates without award or membership requirements',()=>{
 const {PDF,calls}=recorder(),doc=createGuidelinesPDF({PDF}),text=calls.map(c=>c.text).join(' ');
 assert.equal(doc.getNumberOfPages(),3);
 for(const track of tracks){assert.ok(text.includes('TR-'+track.id));assert.ok(text.includes(track.title));}
 for(const phrase of ['300 words','31 December 2026','15 January 2027','Registration ID','IAEC/IEC','neurometpharmacon27@gmail.com','Word document'])assert.ok(text.includes(phrase),phrase);
 assert.doesNotMatch(text,/young scientist|young investigator|membership|age <=|birth certificate|recommendation letter/i);
 for(const call of calls){assert.ok(call.left>=17.5,JSON.stringify(call));assert.ok(call.right<=192.5,JSON.stringify(call));assert.ok(call.y>=10&&call.y<=294,JSON.stringify(call));if(call.y<267)assert.ok(call.y<=260,JSON.stringify(call));}
 // Non-final full-width paragraph lines finish at the right margin, rather than ragged wrapping.
 const paragraph=calls.filter(c=>c.page===1&&c.y>80&&c.y<125&&c.size===10.2),lineMap=new Map();
 for(const call of paragraph){const line=lineMap.get(call.y)||[];line.push(call);lineMap.set(call.y,line);}
 assert.ok([...lineMap.values()].some(line=>line.length>5&&Math.abs(line.at(-1).right-192)<.1));
});
test('standalone template is one page with only Oral and Poster choices and embedded branding',()=>{
 const {PDF,calls}=recorder(),doc=createTemplatePDF({PDF}),text=calls.map(c=>c.text).join(' '),output=doc.output();
 assert.equal(doc.getNumberOfPages(),1);assert.match(text,/Illustrative example only/);assert.match(text,/Oral presentation/);assert.match(text,/Poster presentation/);
 assert.doesNotMatch(text,/award|membership|age <=/i);assert.ok((output.match(/\/Subtype \/Image/g)||[]).length>=2);
 assert.ok(doc.getFontList().GuidelinesSans.includes('bold'));
 for(const call of calls){assert.ok(call.left>=17.5&&call.right<=192.5,JSON.stringify(call));assert.ok(call.y<=294,JSON.stringify(call));}
});
test('regeneration updates current and legacy PDF downloads with identical copies',t=>{
 const targetDir=fs.mkdtempSync(path.join(os.tmpdir(),'nmp-guidelines-'));t.after(()=>fs.rmSync(targetDir,{recursive:true,force:true}));
 const files=generateAbstractGuidelinesPDF({targetDir});assert.equal(files.length,2);
 for(const [current,legacy] of [['NeuroMet_Pharmacon_2027_Abstract_Guidelines.pdf','IPS_NorthZone_Abstract_Guidelines_2027.pdf'],['NeuroMet_Pharmacon_2027_Abstract_Template.pdf','IPS_NorthZone_Abstract_Template_2027.pdf']])assert.deepEqual(fs.readFileSync(path.join(targetDir,current)),fs.readFileSync(path.join(targetDir,legacy)));
});
test('website and current text downloads omit withdrawn requirements and refresh PDF links',()=>{
 const html=fs.readFileSync('index.html','utf8');assert.equal(html,fs.readFileSync('public/index.html','utf8'));
 assert.doesNotMatch(html,/Young Scientist|Young Investigator Awards|value="Award"/i);
 assert.match(html,/Abstract_Guidelines\.pdf\?v=20261112-guidelines/);assert.match(html,/Abstract_Template\.pdf\?v=20261112-guidelines/);
 for(const file of ['NeuroMet_Pharmacon_2027_Abstract_Template.txt','NeuroMedPharmacon_2027_Abstract_Template.txt'])assert.doesNotMatch(fs.readFileSync('public/downloads/'+file,'utf8'),/award|membership|age <=/i);
 const headers=JSON.parse(fs.readFileSync('vercel.json','utf8')).headers.find(row=>row.source==='/downloads/(.*)').headers;
 assert.ok(headers.some(h=>h.key==='Cache-Control'&&h.value.includes('must-revalidate')&&!h.value.includes('immutable')));
});
