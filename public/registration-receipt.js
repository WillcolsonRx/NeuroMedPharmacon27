(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RegistrationReceipt=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const navy=[7,23,41],gold=[203,162,52],ink=[18,37,61],muted=[91,110,130],line=[220,228,237];
 const clean=value=>String(value||'-').replace(/₹\s*/g,'INR ').replace(/(INR\s+[\d,.]+)\s+INR\b/g,'$1').replace(/[–—]/g,'-').replace(/\u00a0/g,' ');
 let assetPromise;
 function base64(bytes){
  const chunks=[];for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
  return btoa(chunks.join(''));
 }
 function loadAssets(fetcher){
  if(!assetPromise)assetPromise=Promise.all([
   '/assets/logos/niper_logo.png','/assets/logos/ips_logo.png',
   '/assets/fonts/NotoSans-Regular.ttf','/assets/fonts/NotoSans-Bold.ttf'
  ].map(async url=>{
   const response=await fetcher(url);if(!response.ok)throw Error('Receipt branding could not load');
   const bytes=new Uint8Array(await response.arrayBuffer());return url.endsWith('.ttf')?base64(bytes):bytes;
  })).then(([niper,ips,regular,bold])=>({niper,ips,regular,bold})).catch(error=>{assetPromise=null;throw error;});
  return assetPromise;
 }
 function filename(fields){return 'NeuroMet Pharmacon-2027_Receipt_'+String(fields.receiptRegId||'registration').replace(/[^a-zA-Z0-9_-]/g,'_')+'.pdf';}
 function create(jsPDF,fields,logos,options={}){
  if(!logos?.niper||!logos?.ips||!logos?.regular||!logos?.bold)throw Error('Official logos and receipt fonts are required');
  const doc=new jsPDF({unit:'mm',format:'a4',orientation:'portrait',putOnlyUsedFonts:true,compress:true});
  doc.addFileToVFS('NotoSans-Regular.ttf',logos.regular);doc.addFont('NotoSans-Regular.ttf','ReceiptSans','normal');
  doc.addFileToVFS('NotoSans-Bold.ttf',logos.bold);doc.addFont('NotoSans-Bold.ttf','ReceiptSans','bold');
  const width=210,margin=18,usable=174,bottom=225;
  const generated=(options.generatedAt||new Date()).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'});
  let y=91;
  doc.setProperties({title:'Registration Receipt | NeuroMet Pharmacon-2027',subject:'Delegate registration receipt',author:'NeuroMet Pharmacon-2027 Secretariat',creator:'Conference registration portal'});
  function text(value,x,at,size=10,color=ink,weight='normal',extra={}){
   doc.setFont('ReceiptSans',weight);doc.setFontSize(size);doc.setTextColor(...color);doc.text(value,x,at,extra);
  }
  function header(){
   doc.setFillColor(...navy);doc.rect(0,0,width,49,'F');doc.setFillColor(...gold);doc.rect(0,49,width,1.6,'F');
   text('OFFICIAL DELEGATE RECEIPT',margin,13,8.5,gold,'bold');
   text('NeuroMet Pharmacon-2027',margin,27,21,[255,255,255],'bold');
   text('19-20 February 2027  |  Workshop: 21 February 2027',margin,37,9,[216,226,237]);
   text('REGISTRATION ID',margin,61,8,muted,'bold');
   doc.setFont('ReceiptSans','bold');doc.setFontSize(17);
   const id=doc.splitTextToSize(clean(fields.receiptRegId),110);
   text(id,margin,71,id.length>1?11:17,navy,'bold');
   doc.setFillColor(250,246,232);doc.roundedRect(137,57,55,24,2,2,'F');
   text('TOTAL AMOUNT',142,64,7.5,muted,'bold');
   const amount=clean(fields.receiptAmount).match(/(?:INR\s*)?[\d,]+(?:\.\d{1,2})?/i)?.[0]||clean(fields.receiptAmount);
   text(amount,142,72,15,navy,'bold');text('18% GST included',142,77,7,muted);
   doc.setDrawColor(...line);doc.line(margin,85,192,85);
  }
  function nextPage(){doc.addPage();header();y=96;}
  function room(height){if(y+height>bottom)nextPage();}
  function paragraph(value,size,color=ink,weight='normal',gap=5){
   doc.setFont('ReceiptSans',weight);doc.setFontSize(size);const lines=doc.splitTextToSize(clean(value),usable);
   for(const row of lines){room(gap);text(row,margin,y,size,color,weight);y+=gap;}
  }
  function row(label,value,index){
   doc.setFont('ReceiptSans','normal');doc.setFontSize(10);let lines=doc.splitTextToSize(clean(value),116);
   let continued=false;
   while(lines.length){
    room(17);const count=Math.max(1,Math.floor((bottom-y-9)/4.7)),part=lines.splice(0,count),height=Math.max(14,part.length*4.7+8);
    doc.setFillColor(...(index%2?[255,255,255]:[245,248,251]));doc.rect(margin,y,usable,height,'F');
    text(label+(continued?' (cont.)':''),margin+4,y+7,8.5,muted);
    text(part,margin+52,y+7,10,ink,'normal',{lineHeightFactor:1.33});
    doc.setDrawColor(...line);doc.line(margin,y+height,192,y+height);y+=height;continued=true;
   }
  }
  header();
  text('DELEGATE',margin,y,8,muted,'bold');y+=9;
  paragraph(fields.receiptName,17,navy,'bold',7);y+=2;
  paragraph(fields.receiptAffiliation,10,muted,'normal',5);y+=8;
  room(13);text('REGISTRATION DETAILS',margin,y,8,muted,'bold');y+=5;
  [
   ['Category',fields.receiptCategory],['Registration rate',fields.receiptTier],
   ['Workshop',fields.receiptWorkshop],['Transaction reference',fields.receiptPaymentRef]
  ].forEach(([label,value],i)=>row(label,value,i));
  y+=8;room(19);doc.setFillColor(237,247,241);doc.roundedRect(margin,y,usable,18,2,2,'F');
  text('Payment proof received',margin+4,y+7,10,[26,98,60],'bold');
  text('Subject to verification by the Conference Secretariat.',margin+4,y+13,8.5,[45,104,72]);y+=26;
  if(y+4<=bottom){text('Keep this receipt and present your Registration ID at the registration counter.',margin,y,8,muted);}
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page++){
   doc.setPage(page);
   text('No confirmation email within 24 hours? Check spam/junk, then contact:',margin,237,8,muted);
   doc.setFont('ReceiptSans','bold');doc.setFontSize(8);doc.setTextColor(18,92,162);
   doc.textWithLink('neurometpharmacon27@gmail.com',margin,243,{url:'mailto:neurometpharmacon27@gmail.com'});
   text('Please include your Registration ID.',105,243,8,muted);
   doc.setFillColor(248,250,252);doc.setDrawColor(...line);doc.roundedRect(margin,252,usable,29,2,2,'FD');
   doc.addImage(logos.niper,'PNG',28,256,18,20.32,'niper-official');
   doc.addImage(logos.ips,'PNG',73,258,93,18.89,'ips-official');
   text('NIPER Raebareli, Lucknow Campus  |  NeuroMet Pharmacon-2027',margin,287,7,muted);
   text('Generated '+generated+' (IST)',margin,292,7,muted);text('Page '+page+' of '+pages,192,292,7,muted,'normal',{align:'right'});
  }
  return doc;
 }
 return {create,loadAssets,filename};
});
