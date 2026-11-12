(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RegistrationReference=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const compactPattern=/^NMP27-[A-F0-9]{12}$/;
 const sequentialPattern=/^NMP27-A[1-9][0-9]{0,9}$/;
 const fullPattern=/^NMP27-DEL-[A-Z0-9-]{5,64}$/;
 function display(value){
  const ref=String(value||'').trim().toUpperCase();
  return /^NMP27-DEL-(?:[A-F0-9]{16}|[A-F0-9]{32})$/.test(ref)?'NMP27-'+ref.slice(-12):ref;
 }
 return {display,isCompact:ref=>compactPattern.test(ref),isValid:ref=>sequentialPattern.test(ref)||compactPattern.test(ref)||fullPattern.test(ref)};
});
