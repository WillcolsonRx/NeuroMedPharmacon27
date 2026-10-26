const test = require('node:test');
const assert = require('node:assert/strict');
const {validatePaymentProofPayload,MAX_FILE_SIZE} = require('../paymentValidator');
test('payment proof accepts 200 KB and rejects any larger payload', () => {
  assert.equal(MAX_FILE_SIZE,200*1024);
  function proof(size) {
    const bytes=Buffer.alloc(size);
    Buffer.from('89504e470d0a1a0a','hex').copy(bytes);
    return 'data:image/png;base64,'+bytes.toString('base64');
  }
  assert.equal(validatePaymentProofPayload(proof(MAX_FILE_SIZE),'proof.png').valid,true);
  const oversized=validatePaymentProofPayload(proof(MAX_FILE_SIZE+1),'proof.png');
  assert.equal(oversized.valid,false);
  assert.match(oversized.error,/200 KB/);
});
