const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { sendMail, handleRegistrationEmails } = require('../mailer');

test('unconfigured SMTP reports a missing configuration instead of simulated delivery', async () => {
  delete process.env.NODE_ENV;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  const result = await sendMail(null, {to:'delegate@example.test',subject:'Test',text:'Test'});
  assert.equal(result.status, 'not_configured');
  assert.equal(result.messageId, null);
});

test('registration waits for both SMTP attempts and preserves failures', async t => {
  process.env.SMTP_USER = 'sender@example.test';
  process.env.SMTP_PASS = 'test-only';
  process.env.SMTP_HOST = 'smtp.example.test';
  let completed = 0;
  t.mock.method(nodemailer, 'createTransport', options => {
    assert.notEqual(options.tls?.rejectUnauthorized, false);
    assert.equal(options.requireTLS, true);
    return {sendMail: async mail => {
      await new Promise(resolve => setTimeout(resolve, 30));
      completed++;
      if (mail.to === 'delegate@example.test') throw new Error('Test SMTP rejection');
      return {messageId:'test-accepted'};
    }};
  });
  const result = await handleRegistrationEmails(null, {full_name:'Test Delegate',email:'delegate@example.test',category:'student',tier:'spot',amount:4500,currency:'INR',ref_id:'TEST',payment_ref:'TEST-1234',has_proof:false});
  assert.equal(completed, 2);
  assert.equal(result.delegate.status, 'failed');
  assert.equal(result.organizer.status, 'sent');
});

test('abstract and sponsorship emails attach files only for admins and preserve failures', async t => {
  delete process.env.NODE_ENV;
  process.env.SMTP_USER='submission-sender@example.test';
  process.env.SMTP_PASS='test-only';
  process.env.ORGANIZER_EMAIL='organizer@example.test';
  const messages=[];
  t.mock.method(nodemailer,'createTransport',()=>({sendMail:async message=>{messages.push(message);if(message.to==='failed@example.test')throw Error('Test rejection');return {messageId:'test-only'};}}));
  const {sendSubmissionEmails}=require('../mailer');
  const attachment={filename:'abstract.docx',content:Buffer.from('test attachment'),contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
  const status=await sendSubmissionEmails(null,'ABSTRACT',{email:'author@example.test',full_name:'Author',title:'Study',category:'Track 1',preference:'Poster',ref_id:'ABS-TEST'},[attachment]);
  assert.deepEqual(status,{delegate:'sent',organizer:'sent'});
  assert.deepEqual(messages.map(m=>m.to),['author@example.test','organizer@example.test']);
  assert.equal(messages[0].attachments.length,0);
  assert.equal(messages[1].attachments[0].content,attachment.content);
  assert.match(messages[0].html,/Abstract Submission Receipt/);
  assert.match(messages[0].html,/ABS-TEST/);
  assert.match(messages[0].html,/Pending scientific review/);
  const failed=await sendSubmissionEmails(null,'SPONSORSHIP',{email:'failed@example.test',company_name:'Company',tier:'Gold',amount:88500,ref_id:'SPON-TEST'},[attachment]);
  assert.deepEqual(failed,{delegate:'failed',organizer:'sent'});
  assert.match(messages[2].text,/Unpaid inquiry/);
  assert.equal(messages[2].attachments.length,0);
  assert.equal(messages[3].attachments.length,1);
  assert.match(messages[2].html,/Sponsorship Acknowledgement/);
});

test('R2 registration Secretariat copy attaches proof; uncertain and temporary SMTP outcomes remain distinguishable',async t=>{
 delete process.env.NODE_ENV;process.env.SMTP_USER='r2-sender@example.test';process.env.SMTP_PASS='test-only';process.env.SMTP_HOST='smtp.example.test';process.env.ORGANIZER_EMAIL='r2-organizer@example.test';
 const messages=[];t.mock.method(nodemailer,'createTransport',()=>({sendMail:async message=>{messages.push(message);if(message.to==='temporary@example.test')throw Object.assign(Error('Temporary rejection'),{responseCode:451});if(message.to==='uncertain@example.test')throw Object.assign(Error('Connection timed out'),{code:'ETIMEDOUT'});return {messageId:'mock-only'};}}));
 const proof={filename:'proof.png',content:Buffer.from('mock proof'),contentType:'image/png'};
 const results=await handleRegistrationEmails(null,{full_name:'<b>Delegate</b>',email:'r2-delegate@example.test',category:'student',amount:3500,currency:'INR',ref_id:'NMP27-DEL-TEST',has_proof:true,proof_attachments:[proof]});
 assert.equal(results.organizer.status,'sent');assert.equal(messages.find(m=>m.to==='r2-organizer@example.test').attachments[0].content,proof.content);assert.equal(messages.find(m=>m.to==='r2-delegate@example.test').attachments.length,0);assert.match(messages[0].html,/&lt;b&gt;Delegate&lt;\/b&gt;/);
 const uncertain=await sendMail(null,{to:'uncertain@example.test',subject:'Test',text:'Test'});assert.equal(uncertain.status,'failed');assert.equal(uncertain.uncertain,true);assert.equal(uncertain.retryable,false);
 const temporary=await sendMail(null,{to:'temporary@example.test',subject:'Test',text:'Test'});assert.equal(temporary.retryable,true);assert.equal(temporary.uncertain,false);
});
