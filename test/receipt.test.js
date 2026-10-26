const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { jsPDF } = require('jspdf');

test('receipt button creates a PDF containing registration details', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const fn = html.slice(html.indexOf('function downloadRegistrationReceipt()'), html.indexOf('function closeReceiptModal()'));
  const values = {receiptRegId:'NMP27-DEL-TEST',receiptName:'Test Delegate',receiptCategory:'Faculty',receiptTier:'SPOT',receiptWorkshop:'Not Opted',receiptPaymentRef:'UTR-12345',receiptAmount:'₹6500 INR'};
  let saved;
  function Pdf() { const doc = new jsPDF(); doc.save = name => { saved = { name, content: doc.output() }; }; return doc; }
  vm.runInNewContext(fn + '\ndownloadRegistrationReceipt();', { window: {jspdf:{jsPDF:Pdf}}, document: {getElementById:id=>({textContent:values[id]})}, alert: msg=>assert.fail(msg) });
  assert.equal(saved.name,'NeuroMet Pharmacon-2027_Receipt_NMP27-DEL-TEST.pdf');
  assert.ok(saved.content.startsWith('%PDF-'));
  assert.ok(saved.content.includes('Test Delegate'));
  assert.ok(saved.content.includes('UTR-12345'));
});
