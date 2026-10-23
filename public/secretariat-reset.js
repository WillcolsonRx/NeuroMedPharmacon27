'use strict';
const $=id=>document.getElementById(id);
let factorId;
const notice=text=>{$('notice').textContent=text;};
async function api(path,body){
 const response=await fetch('/api/secretariat'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();if(!response.ok)throw Error(data.error || 'Recovery request failed');return data;
}
async function showState(){
 const state=await api('/recovery-state');factorId=state.factorId;
 $('requestForm').hidden=true;$('verifyForm').hidden=!state.mfaRequired;$('passwordForm').hidden=state.mfaRequired;
 notice('Recovery session verified for '+state.email+'.');
}
function form(id,handler){$(id).addEventListener('submit',async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await handler();}catch(error){notice(error.message);}finally{button.disabled=false;}});}
form('requestForm',async()=>{const data=await api('/recover',{email:$('recoveryEmail').value.trim()});notice(data.message);});
form('verifyForm',async()=>{await api('/verify',{factorId,code:$('recoveryCode').value});$('recoveryCode').value='';await showState();});
form('passwordForm',async()=>{
 if($('newPassword').value!==$('confirmPassword').value)throw Error('The two passwords do not match.');
 await api('/password',{password:$('newPassword').value});$('newPassword').value='';$('confirmPassword').value='';$('passwordForm').hidden=true;
 notice('Password updated. Return to staff sign in and use your new password.');
});
async function initialize(){
 const params=new URLSearchParams(location.hash.slice(1));
 // Remove recovery credentials and error details from the address bar immediately.
 history.replaceState(null,'',location.pathname);
 if(params.has('error')){notice('This recovery link is invalid, expired or already used. Request a new email below.');return;}
 if(params.has('access_token')){
  try{await api('/recovery-session',{accessToken:params.get('access_token')});params.delete('access_token');params.delete('refresh_token');await showState();}
  catch{notice('This recovery link could not be verified. Request a fresh email below.');}
  return;
 }
 try{await showState();}catch{notice('Request a recovery email to reset your staff password.');}
}
initialize();
