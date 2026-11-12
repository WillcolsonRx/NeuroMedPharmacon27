const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { jsPDF } = require('jspdf');
const Receipt=require('../public/registration-receipt');
const logos={niper:fs.readFileSync('public/assets/logos/niper_logo.png'),ips:fs.readFileSync('public/assets/logos/ips_logo.png'),regular:fs.readFileSync('public/assets/fonts/NotoSans-Regular.ttf').toString('base64'),bold:fs.readFileSync('public/assets/fonts/NotoSans-Bold.ttf').toString('base64')};
const values={receiptRegId:'NMP27-A1',receiptName:'Test Delegate',receiptAffiliation:'Example University',receiptCategory:'Research Scholar / PG Student',receiptTier:'EARLY RATE',receiptWorkshop:'Included (+₹600)',receiptPaymentRef:'DU12345',receiptAmount:'₹4,100 INR (Incl. 18% GST)'};

test('receipt download preserves registration details and embeds the two official logos in a branded PDF',async()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 const fn=html.slice(html.indexOf('async function downloadRegistrationReceipt()'),html.indexOf('function closeReceiptModal()'));
 let saved;const rendered=[];const button={disabled:false,textContent:'Download Receipt PDF'};
 function Pdf(options){const doc=new jsPDF(options),text=doc.text.bind(doc);doc.text=(value,...args)=>{rendered.push(value);return text(value,...args);};doc.save=name=>{saved={name,content:doc.output(),pages:doc.getNumberOfPages()};};return doc;}
 const fetcher=async url=>({ok:true,arrayBuffer:async()=>fs.readFileSync('public'+url)});
 await vm.runInNewContext(fn+'\ndownloadRegistrationReceipt();',{window:{jspdf:{jsPDF:Pdf},RegistrationReceipt:Receipt},fetch:fetcher,document:{getElementById:id=>id==='btnDownloadReceipt'?button:{textContent:values[id]}},alert:msg=>assert.fail(msg),console});
 assert.equal(saved.name,'NeuroMet Pharmacon-2027_Receipt_NMP27-A1.pdf');assert.ok(saved.content.startsWith('%PDF-'));assert.equal(saved.pages,1);
 for(const text of ['Test Delegate','Example University','DU12345','NMP27-A1','Payment proof received','24 hours','neurometpharmacon27@gmail.com'])assert.ok(rendered.flat().join(' ').includes(text),text);
 assert.ok((saved.content.match(/\/Subtype \/Image/g)||[]).length>=2);assert.equal(button.disabled,false);
 assert.ok(!rendered.flat().join(' ').includes('INR 4,100 INR'));assert.equal(html,fs.readFileSync('public/index.html','utf8'));
});

test('long names, affiliations and transaction references continue onto pages with repeating logos and page numbers',()=>{
 const fields={...values,receiptName:'Delegate '.repeat(110),receiptAffiliation:'Department of Pharmacology, Example Research University, '.repeat(30),receiptPaymentRef:'BANK-REFERENCE-'.repeat(90)};
 const rendered=[],images=[];function Pdf(options){const doc=new jsPDF(options),text=doc.text.bind(doc),addImage=doc.addImage.bind(doc);doc.text=(value,...args)=>{rendered.push(value);return text(value,...args);};doc.addImage=(...args)=>{images.push(args);return addImage(...args);};return doc;}
 const doc=Receipt.create(Pdf,fields,logos,{generatedAt:new Date('2026-11-12T00:00:00Z')});const pages=doc.getNumberOfPages(),content=doc.output();
 assert.ok(pages>1);assert.ok(rendered.flat().join(' ').includes('Generated 12 Nov 2026'));assert.ok(rendered.flat().join(' ').includes('Page '+pages+' of '+pages));
 assert.equal(images.length,pages*2);
});

test('receipt download failure preserves registration and re-enables the download button',async()=>{
 const html=fs.readFileSync('index.html','utf8');const fn=html.slice(html.indexOf('async function downloadRegistrationReceipt()'),html.indexOf('function closeReceiptModal()'));
 const button={disabled:false,textContent:'Download Receipt PDF'},alerts=[];
 await vm.runInNewContext(fn+'\ndownloadRegistrationReceipt();',{window:{jspdf:{jsPDF},RegistrationReceipt:{loadAssets:async()=>{throw Error('Network unavailable');}}},fetch:()=>{},document:{getElementById:id=>id==='btnDownloadReceipt'?button:{textContent:values[id]}},alert:message=>alerts.push(message),console:{error(){}}});
 assert.equal(button.disabled,false);assert.equal(button.textContent,'Download Receipt PDF');assert.match(alerts[0],/Your registration is saved/);
});
