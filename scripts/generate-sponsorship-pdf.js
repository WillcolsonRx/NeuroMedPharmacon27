const fs=require('fs');
const path=require('path');
const {createDocumentLayout}=require('./generate-guidelines-pdf');
const CONTACT='neurometpharmacon27@gmail.com';
const PHONE='(+91) 9250446799';
const NAVY=[7,23,41],MUTED=[91,110,130],GOLD=[153,111,20];
const PACKAGES=[
 {name:'Platinum sponsor',amount:'INR 1,00,000 + 18% GST',benefits:'Space for one display booth; two complimentary registrations; displayed as a sponsor of the conference.'},
 {name:'Gold sponsor',amount:'INR 50,000 + 18% GST',benefits:'Space for one display booth; one complimentary registration; displayed as a sponsor of the conference.'},
 {name:'Silver sponsor',amount:'INR 25,000 + 18% GST',benefits:'One complimentary registration; no display booth; displayed as a sponsor of the conference.'}
];
const TERMS=[
 ['1. Stall allocation','Stalls will be allotted on a first-come, first-served basis upon receipt of official confirmation and advance payment.'],
 ['2. Payment schedule','A 50% advance payment is required upon confirmation. The remaining balance must be settled 30 days before the conference.'],
 ['3. Taxes and invoice','GST at 18% is applicable as per Government of India tax regulations. A formal GST invoice will be issued by NIPER-Raebareli.'],
 ['4. Standard stall','Standard stall provisions include an octanorm structure, two spotlights, one 5A power socket, one discussion table and two chairs.']
];
function createSponsorshipProspectusPDF(options={}){
 const out=createDocumentLayout(options),doc=out.doc;
 doc.setProperties({title:'Sponsorship & Exhibition Prospectus | NeuroMet Pharmacon-2027',subject:'Industry sponsorship and exhibition opportunities',author:'NeuroMet Pharmacon-2027 Secretariat'});
 out.newPage('Sponsorship & exhibition','INDUSTRY PROSPECTUS');
 out.paragraph('Industry sponsorship and exhibition opportunities for pharmaceutical, analytical instrumentation and biotechnology organizations.',{after:4});
 out.heading('Expected congress footprint');
 const start=out.y;
 const stats=[['300+','Peer-reviewed abstracts'],['10','Curated thematic tracks'],['30','Scientific talks'],['20+','Commercial exhibitors']];
 for(let i=0;i<stats.length;i++){
  const x=i%2?108:18,y=start+Math.floor(i/2)*22;
  doc.setFillColor(245,248,251);doc.roundedRect(x,y-4,84,19,1.5,1.5,'F');
  out.text(stats[i][0],x+4,y+3,14,true,NAVY);out.text(stats[i][1],x+4,y+10,8.8,false,MUTED);
 }
 out.y=start+43;out.paragraph('Two conference days (19–20 February) plus a post-conference workshop (21 February).',{size:9,gap:4.6,after:5,justify:false});
 out.heading('Commercial sponsorship packages');
 for(const pack of PACKAGES){
  const y=out.y;doc.setFillColor(248,250,252);doc.setDrawColor(221,229,237);doc.roundedRect(18,y-4,174,28,1.5,1.5,'FD');
  out.text(pack.name,22,y+3,11.2,true,NAVY);out.text(pack.amount,188,y+3,10.2,true,GOLD,{align:'right'});
  out.y=y+10;out.paragraph(pack.benefits,{x:22,w:166,size:9.7,gap:4.8,after:0});out.y=y+32;
 }
 out.paragraph('Commercial package prices above exclude 18% GST.',{size:9,gap:4.6,after:0,justify:false});
 out.newPage('Booking and voluntary support','SPONSORSHIP PROSPECTUS');
 out.heading('Philanthropic support');
 out.paragraph('The contribution amount is agreed with the Secretariat. Philanthropic support includes one lunch and one dinner for one supporter, without commercial deliverables. Delegate registration is separate. The institution will confirm the contribution amount and applicable tax treatment before payment.',{after:6});
 out.heading('Stall allocation and booking protocol');
 TERMS.forEach(([label,body],index)=>out.specification(label,body,index));
 out.y+=7;out.heading('Contact the Sponsorship Secretariat');
 out.paragraph('For sponsorship bookings, custom commercial exhibition packages or symposium sponsorship, contact the Secretariat.',{after:3});
 out.font(10.5,true);doc.setTextColor(18,92,162);doc.textWithLink(CONTACT,18,out.y,{url:'mailto:'+CONTACT});out.y+=7;
 out.text(PHONE,18,out.y,10.5,true,NAVY);
 return out.finish();
}
function generateSponsorshipProspectusPDF({targetDir=path.join(__dirname,'../public/downloads')}={}){
 fs.mkdirSync(targetDir,{recursive:true});const doc=createSponsorshipProspectusPDF(),bytes=Buffer.from(doc.output('arraybuffer'));
 const file=path.join(targetDir,'NeuroMet_Pharmacon_2027_Sponsorship_Prospectus.pdf');fs.writeFileSync(file,bytes);
 fs.writeFileSync(path.join(targetDir,'IPS_NorthZone_Sponsorship_Prospectus_2027.pdf'),bytes);
 console.log(`Generated sponsorship prospectus: ${doc.getNumberOfPages()} pages, ${bytes.length} bytes`);return file;
}
module.exports={createSponsorshipProspectusPDF,generateSponsorshipProspectusPDF};
if(require.main===module)generateSponsorshipProspectusPDF();
