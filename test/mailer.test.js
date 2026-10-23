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

test('abstract and sponsorship emails carry attachments to both recipients and preserve failures', async t => {
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
  for(const message of messages)assert.equal(message.attachments[0].content,attachment.content);
  const failed=await sendSubmissionEmails(null,'SPONSORSHIP',{email:'failed@example.test',company_name:'Company',tier:'Gold',amount:88500,ref_id:'SPON-TEST'},[attachment]);
  assert.deepEqual(failed,{delegate:'failed',organizer:'sent'});
  assert.match(messages[2].text,/Unpaid inquiry/);
});
