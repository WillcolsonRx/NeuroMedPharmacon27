const fs=require('fs');
const path=require('path');
const {jsPDF}=require('jspdf');
const {tracks}=require('../conference-tracks.json');
const ROOT=path.join(__dirname,'..');
const NAVY=[7,23,41],GOLD=[203,162,52],INK=[34,51,70],MUTED=[91,110,130],LINE=[221,229,237];
const CONTACT='neurometpharmacon27@gmail.com';
const PORTAL='https://neuro-med-pharmacon-27.vercel.app/#abstracts';
const SPECIFICATIONS=[
 ['Title','Brief, informative and in Title Case. Avoid abbreviations.'],
 ['Authors & affiliations','Give the full names of all authors, their departments, institutes, city, state and PIN code. Underline the presenting author. Mark the corresponding author with an asterisk (*) and provide a valid email address.'],
 ['Background & rationale','Explain the scientific gap, unmet therapeutic need and primary hypothesis in two or three sentences.'],
 ['Materials & methods','Describe the study design, models or cell lines, agents and dosages, assays, instrumentation or in-silico methods. Include the IAEC/IEC ethics-clearance number where applicable.'],
 ['Results & discussion','Summarize primary quantitative findings and statistical significance (for example, p < 0.05; mean ± SEM). Do not include figures, graphs or tables in the abstract text.'],
 ['Conclusions & impact','State the main conclusion and its translational relevance to drug development or clinical therapeutics.'],
 ['Keywords','Provide four to six relevant keywords, separated by semicolons.']
];
const CONTENT={
  "mandateText": "The Scientific Program Committee invites original research abstracts spanning chemistry, pharmacology, biotechnology, and translational drug discovery, with a focus on neuro-metabolic disorders, cancer, and safety sciences. Submissions are open to faculty members, scientists, postdoctoral researchers, PhD scholars, and postgraduate students (MD/MS/M.Pharm/Pharm.D/M.Sc) from recognized academic and research institutions across India and internationally. Registration is required before submission. Verify your receipt Registration ID and registration email in the portal.",
  "exBg": "Ischemic cerebral stroke initiates acute microglial polarization accompanied by catastrophic neurovascular breakdown. Despite recanalization therapies, post-ischemic secondary neuroinflammation remains therapeutically unaddressed. Here, we hypothesized that pharmacological inhibition of NLRP3 inflammasome priming via a novel small-molecule scaffold suppresses neurotoxic cytokines and salvages ischemic penumbral tissue.",
  "exMm": "Adult male Sprague-Dawley rats (250–280 g, IAEC Approval # NIPER/IAEC/2026/04) were subjected to 90-minute transient middle cerebral artery occlusion (tMCAO) followed by 24h reperfusion. Vehicle or Test Agent (5, 10, 20 mg/kg i.v.) was administered at reperfusion onset. Neurological deficit scoring (mNSS), TTC cerebral infarct planimetry, blood-brain barrier permeability (Evans blue extravasation), and immunofluorescence for Iba-1/GFAP were quantified.",
  "exRd": "Test Agent (10 mg/kg) caused a 48.6% reduction in total cerebral infarct volume compared to vehicle-treated controls (p < 0.001, one-way ANOVA with Dunnett's post-test). Neurological deficit scores improved significantly within 24 hours (mNSS 5.2 vs 11.8 in vehicle). Western blotting of penumbral tissue confirmed downregulation of cleaved caspase-1 and mature IL-1beta without altering systemic hemodynamics.",
  "exCo": "The findings establish this novel pharmacophore as a potent, brain-penetrant neurovascular protective lead candidate capable of dampening neuroinflammation during the hyperacute reperfusion window."
};
function brandAssets(){return {
 regular:fs.readFileSync(path.join(ROOT,'public/assets/fonts/NotoSans-Regular.ttf')).toString('base64'),
 bold:fs.readFileSync(path.join(ROOT,'public/assets/fonts/NotoSans-Bold.ttf')).toString('base64'),
 niper:fs.readFileSync(path.join(ROOT,'public/assets/logos/niper_logo.png')),
 ips:fs.readFileSync(path.join(ROOT,'public/assets/logos/ips_logo.png'))
};}
function layout({PDF=jsPDF}={}){
 const doc=new PDF({unit:'mm',format:'a4',orientation:'portrait',compress:true,putOnlyUsedFonts:true});
 const assets=brandAssets();
 for(const [style,file] of [['normal','regular'],['bold','bold']]){const name='Guidelines-'+style+'.ttf';doc.addFileToVFS(name,assets[file]);doc.addFont(name,'GuidelinesSans',style);}
 let y=75;const left=18,width=174,bottom=260;
 const font=(size=10.2,bold=false,color=INK)=>{doc.setFont('GuidelinesSans',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);};
 function text(value,x,at,size=10.2,bold=false,color=INK,extra={}){font(size,bold,color);doc.text(value,x,at,extra);}
 function page(title,kicker='ABSTRACT SUBMISSION'){
  doc.setFillColor(...NAVY);doc.rect(0,0,210,43,'F');doc.setFillColor(...GOLD);doc.rect(0,43,210,1.5,'F');
  text('NeuroMet Pharmacon-2027',left,15,19,true,[255,255,255]);
  text('Integrating AI, Drug Discovery, Therapeutics and Pharmacology',left,24,8.4,false,[216,226,237]);
  text('for Neurometabolic Disorders',left,29,8.4,false,[216,226,237]);
  text('19–20 February 2027  |  Post-conference workshop: 21 February',left,37,8.3,false,[216,226,237]);
  text(kicker,left,54,8.2,true,MUTED);text(title,left,65,17,true,NAVY);y=75;
 }
 let opened=false;
 function newPage(title,kicker){if(opened)doc.addPage();opened=true;page(title,kicker);}
 function room(height){if(y+height>bottom)newPage('Submission guidelines — continued');}
 function heading(title){room(16);text(title,left,y,11.3,true,NAVY);y+=8;}
 function paragraph(value,{x=left,w=width,size=10.2,gap=5.1,after=4,justify=true}={}){
  font(size);const lines=doc.splitTextToSize(value,w);
  lines.forEach((row,index)=>{room(gap);font(size);
   const words=row.trim().split(/\s+/),natural=doc.getTextWidth(row),gaps=words.length-1;
   // Justify complete lines; paragraph endings retain natural word spacing.
   if(justify&&index<lines.length-1&&gaps>=3&&natural>w*.68){
    const extra=(w-natural)/gaps,space=doc.getTextWidth(' ');let at=x;
    words.forEach((word,i)=>{text(word,at,y,size);at+=doc.getTextWidth(word)+(i<gaps?space+extra:0);});
   }else text(row,x,y,size);
   y+=gap;
  });y+=after;
 }
 function specification(label,body,index){
  font(9.6,true);const labelLines=doc.splitTextToSize(label,36);font(10.1);const bodyLines=doc.splitTextToSize(body,128);
  const height=Math.max(labelLines.length,bodyLines.length)*4.9+6;room(height);
  if(index%2===0){doc.setFillColor(245,248,251);doc.roundedRect(left,y-4,width,height,1,1,'F');}
  text(labelLines,left+3,y+1,9.6,true,NAVY,{lineHeightFactor:1.45});
  const at=y;y+=1;paragraph(body,{x:left+43,w:128,size:10.1,gap:4.9,after:0});y=at+height;
 }
 function finish(){
  const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){
   doc.setPage(i);doc.setDrawColor(...LINE);doc.line(left,267,192,267);
   doc.addImage(assets.niper,'PNG',20,271,11,12.42,'niper-official');doc.addImage(assets.ips,'PNG',45,273,61,12.39,'ips-official');
   text('NIPER Raebareli, Lucknow Campus',192,277,7.4,false,MUTED,{align:'right'});
   text('Page '+i+' of '+pages,192,283,7.4,false,MUTED,{align:'right'});
   text(CONTACT,left,292,7.8,false,MUTED);
   doc.link(left,288,80,6,{url:'mailto:'+CONTACT});
  }return doc;
 }
 return {doc,text,font,newPage,heading,paragraph,specification,finish,room,get y(){return y;},set y(value){y=value;},left,width};
}
function example(out){
 out.newPage('Structured abstract example','AUTHOR TEMPLATE · MAXIMUM 300 WORDS');
 out.paragraph('Illustrative example only. Replace all example names, study details, ethics approvals and findings with your own research.',{size:9.4,gap:4.8,after:5});
 out.font(11.3,true);const title='Molecular Dissection of Neuroinflammatory Signaling in Ischemic Stroke';
 const titleLines=out.doc.splitTextToSize(title,174);out.text(titleLines,18,out.y,11.3,true,NAVY,{lineHeightFactor:1.4});out.y+=titleLines.length*5.6+3;
 out.paragraph('Amit K. Sharma¹*, Neha Rastogi¹, Rajeshwar S. Verma²',{size:9.6,gap:4.7,after:1,justify:false});
 out.paragraph('¹ Department of Pharmacology & Toxicology, NIPER-Raebareli, Lucknow 226002, India.\n² Division of Neuroscience & Ageing Biology, CSIR-CDRI, Lucknow 226031, India.',{size:8.7,gap:4.2,after:2,justify:false});
 out.paragraph('* Corresponding author: [your email]  |  Presenting author: [underline the name]\nTrack: TR-01 — Neuropharmacology & Neurotherapeutics',{size:8.7,gap:4.2,after:4,justify:false});
 for(const [label,body] of [['Background & objectives',CONTENT.exBg],['Materials & methods',CONTENT.exMm],['Results & discussion',CONTENT.exRd],['Conclusions',CONTENT.exCo]]){
  out.heading(label);out.paragraph(body,{size:9.6,gap:4.6,after:3});
 }
 out.paragraph('Keywords: Ischemic stroke; NLRP3 inflammasome; Microglia; Neuroprotection; NIPER-Raebareli',{size:9,gap:4.4,after:3,justify:false});
 out.paragraph('Presentation preference:  [ ] Oral presentation    [ ] Poster presentation',{size:9,gap:4.4,after:0,justify:false});
}
function createGuidelinesPDF(options={}){
 const out=layout(options);out.newPage('Abstract submission guidelines');
 out.heading('1. Eligibility and submission');out.paragraph(CONTENT.mandateText+' The abstract body must not exceed 300 words, excluding the title, authors and affiliations.',{after:5});
 out.heading('2. Structured format — maximum 300 words');SPECIFICATIONS.forEach(([label,body],index)=>out.specification(label,body,index));
 out.newPage('Scientific tracks and key dates');out.heading('3. Choose one thematic track');
 out.paragraph('Select the most appropriate track in the online abstract-submission form.',{after:6});
 for(let i=0;i<5;i++){
  const y=out.y;let height=0;
  for(const [track,x] of [[tracks[i],18],[tracks[i+5],108]]){
   out.font(10.2,true);const lines=out.doc.splitTextToSize(track.title,78);
   out.text('TR-'+track.id,x,y,8.5,true,[153,111,20]);out.text(lines,x,y+6,10.2,true,NAVY,{lineHeightFactor:1.4});height=Math.max(height,lines.length*5.1+9);
  }out.y+=height;
 }
 out.y+=3;out.heading('4. Important dates');
 out.specification('Abstract deadline','31 December 2026',0);out.specification('Acceptance notice','15 January 2027',1);
 out.y+=5;out.heading('5. Before you submit');
 out.paragraph('Prepare a Word document (.doc or .docx), no larger than 1 MB, using Times New Roman or Calibri, 12 pt, with 1.15 line spacing. Check the word limit, author details, ethics information and selected track. Register for the conference first, then verify your Registration ID and the same registration email in the submission portal.',{size:10,gap:4.9,after:3});
 out.text('Submit online',18,out.y,9.4,true,NAVY);out.y+=5;
 out.doc.setTextColor(18,92,162);out.doc.setFontSize(8.6);out.doc.textWithLink(PORTAL,18,out.y,{url:PORTAL});
 example(out);return out.finish();
}
function createTemplatePDF(options={}){const out=layout(options);example(out);return out.finish();}
function generateAbstractGuidelinesPDF({targetDir=path.join(ROOT,'public/downloads')}={}){
 fs.mkdirSync(targetDir,{recursive:true});
 const files=[['NeuroMet_Pharmacon_2027_Abstract_Guidelines.pdf',createGuidelinesPDF()],['NeuroMet_Pharmacon_2027_Abstract_Template.pdf',createTemplatePDF()]];
 for(const [filename,doc] of files){const bytes=Buffer.from(doc.output('arraybuffer'));fs.writeFileSync(path.join(targetDir,filename),bytes);const legacy=filename.includes('Guidelines')?'IPS_NorthZone_Abstract_Guidelines_2027.pdf':'IPS_NorthZone_Abstract_Template_2027.pdf';fs.writeFileSync(path.join(targetDir,legacy),bytes);console.log(`Generated ${filename}: ${doc.getNumberOfPages()} page(s), ${bytes.length} bytes`);}
 return files.map(([filename])=>path.join(targetDir,filename));
}
module.exports={createGuidelinesPDF,createTemplatePDF,generateAbstractGuidelinesPDF};
if(require.main===module)generateAbstractGuidelinesPDF();
