(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ConferenceShare=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const canonical='https://neuro-med-pharmacon-27.vercel.app/';
 const url=canonical+'?share=20261118';
 const poster='/assets/social/neuromet-pharmacon-2027-share-20261118.png';
 const title='NeuroMet Pharmacon-2027';
 function invitation(now=new Date()){
  const lines=[
   '*NeuroMet Pharmacon-2027*','',
   'Integrating AI, Drug Discovery, Therapeutics and Pharmacology for Neurometabolic Disorders','',
   '• Conference: 19–20 February 2027',
   '• Network Pharmacology workshop: 21 February 2027',
   '• NIPER-Raebareli, Lucknow Campus',
   'In collaboration with Indian Pharmacological Society'
  ];
  if(now<new Date('2027-01-01T00:00:00+05:30'))lines.push('','Abstract deadline: 31 December 2026');
  if(now<new Date('2027-01-16T00:00:00+05:30'))lines.push('Early-bird registration: until 15 January 2027');
  lines.push('','Conference details & registration:');return lines.join('\n');
 }
 const message=now=>invitation(now)+'\n'+url;
 const whatsappUrl=now=>'https://wa.me/?text='+encodeURIComponent(message(now));
 let filePromise;
 function posterFile(fetcher,FileType){
  if(!filePromise)filePromise=(async()=>{
   const response=await fetcher(poster);if(!response.ok)throw Error('Poster unavailable');
   return new FileType([await response.blob()],'NeuroMet_Pharmacon_2027_Conference_Poster.png',{type:'image/png'});
  })().catch(error=>{filePromise=null;throw error;});
  return filePromise;
 }
 return {canonical,url,poster,title,invitation,message,whatsappUrl,posterFile};
});
