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
