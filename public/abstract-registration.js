(() => {
  const form=document.getElementById('abstractForm');
  if(!form)return;
  const registration=document.getElementById('absRegistrationId');
  const email=document.getElementById('absEmail');
  const verify=document.getElementById('btnVerifyAbsRegistration');
  const submit=document.getElementById('btnSubmitAbs');
  const status=document.getElementById('absRegistrationStatus');
  let validated='',revision=0,pending=false,submitting=false,controller;
  const pair=()=>({registration_id:registration.value.trim().toUpperCase(),email:email.value.trim().toLowerCase()});
  const key=()=>JSON.stringify(pair());
  const wellFormed=()=>/^NMP27-DEL-[A-Z0-9-]{5,64}$/.test(pair().registration_id)&&email.value.trim()!==''&&email.checkValidity();
  const matches=()=>wellFormed()&&validated===key();
  function update(){
    verify.disabled=pending||submitting||!wellFormed();
    verify.textContent=pending?'Checking registration...':'Verify Registration';
    submit.disabled=pending||submitting||!matches();
    submit.textContent=submitting?'Submitting Abstract...':matches()?'Submit Abstract for Review →':'Verify registration to unlock';
  }
  function reset(){
    revision++;controller?.abort();controller=null;validated='';pending=false;
    status.textContent='Enter your Registration ID and the same email used for conference registration, then verify to unlock submission.';
    update();
  }
  registration.addEventListener('input',reset);
  email.addEventListener('input',reset);
  form.addEventListener('reset',()=>{reset();setTimeout(update,0);});
  verify.addEventListener('click',async()=>{
    if(!wellFormed()||pending||submitting)return;
    const attempt=++revision,submittedKey=key();
    validated='';pending=true;const requestController=new AbortController();controller=requestController;
    const timer=setTimeout(()=>requestController.abort(),15000);
    status.textContent='Checking your registration...';update();
    try{
      const response=await fetch('/api/abstract/registration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pair()),signal:requestController.signal});
      const data=await response.json();
      if(attempt!==revision||submittedKey!==key())return;
      if(!response.ok||data.eligible!==true)throw new Error(data.error||'Could not verify this registration.');
      validated=submittedKey;status.textContent='Registration verified. Complete your abstract details and attach the Word document to submit.';
    }catch(error){
      if(attempt!==revision)return;
      validated='';status.textContent=error.name==='AbortError'?'Verification timed out. Please try again.':error.message;
    }finally{
      clearTimeout(timer);
      if(attempt===revision){pending=false;controller=null;update();}
    }
  });
  window.AbstractRegistration={
    isEligible:()=>matches()&&!pending&&!submitting,
    reset,
    setSubmitting(value){submitting=value;registration.disabled=value;email.disabled=value;update();}
  };
  reset();
})();
