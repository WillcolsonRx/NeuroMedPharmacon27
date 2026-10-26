const test = require('node:test');
const assert = require('node:assert/strict');
const {zipSync} = require('fflate');
const {validateAbstractDocument} = require('../abstractDocument');
const data = entries => 'data:application/octet-stream;base64,' + Buffer.from(zipSync(entries)).toString('base64');
const entries = {'[Content_Types].xml':Buffer.from('<Types/>'),'word/document.xml':Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>')};
test('accepts a Word DOCX container and normalizes its attachment filename',()=>{
  const result=validateAbstractDocument(data(entries),'../abstract.docx');
  assert.equal(result.filename,'abstract.docx');
  assert.equal(result.ext,'docx');
});
test('rejects missing, spoofed, oversized and macro-enabled abstract documents',()=>{
  assert.throws(()=>validateAbstractDocument(undefined,undefined),/Attach/);
  assert.throws(()=>validateAbstractDocument('data:text/plain;base64,aGVsbG8=','fake.docx'),/Invalid/);
  assert.throws(()=>validateAbstractDocument(data({'test.txt':Buffer.from('not Word')}),'fake.docx'),/not a Word/);
  assert.throws(()=>validateAbstractDocument('data:text/plain;base64,aGVsbG8=','fake.doc'),/Invalid/);
  assert.throws(()=>validateAbstractDocument('data:text/plain;base64,'+'A'.repeat(3*1024*1024),'large.docx'),/exceeds/);
  assert.throws(()=>validateAbstractDocument(data({...entries,'word/vbaProject.bin':Buffer.from('macro')}),'unsafe.docx'),/Invalid/);
});
test('abstract upload limit accepts 1 MB and rejects even one byte above it',()=>{
  const {MAX_DOCUMENT_SIZE}=require('../abstractDocument');
  assert.equal(MAX_DOCUMENT_SIZE,1024*1024);
  function document(size) {
    const bytes=Buffer.alloc(size);
    Buffer.from('d0cf11e0a1b11ae1','hex').copy(bytes);
    Buffer.from('WordDocument','utf16le').copy(bytes,64);
    return 'data:application/msword;base64,'+bytes.toString('base64');
  }
  assert.equal(validateAbstractDocument(document(MAX_DOCUMENT_SIZE),'abstract.doc').buffer.length,MAX_DOCUMENT_SIZE);
  assert.throws(()=>validateAbstractDocument(document(MAX_DOCUMENT_SIZE+1),'abstract.doc'),/1 MB/);
});
