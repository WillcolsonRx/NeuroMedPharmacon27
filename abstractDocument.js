const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { unzipSync, strFromU8 } = require('fflate');
const DOCUMENT_DIR = path.join(__dirname, '.data', 'abstract-documents');
const MAX_DOCUMENT_SIZE = 2 * 1024 * 1024;
const MIME = {doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};

function validateAbstractDocument(data, filename) {
  if (typeof filename !== 'string' || typeof data !== 'string') throw new Error('Attach a Word document (.doc or .docx)');
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (!MIME[ext]) throw new Error('Only .doc and .docx Word documents are supported');
  const match = data.match(/^data:[^;,]*;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[1].length > Math.ceil(MAX_DOCUMENT_SIZE / 3) * 4) throw new Error('Invalid Word document or file exceeds 2 MB');
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length || buffer.length > MAX_DOCUMENT_SIZE) throw new Error('Word document must be between 1 byte and 2 MB');
  if (ext === 'doc') {
    if (buffer.subarray(0,8).toString('hex') !== 'd0cf11e0a1b11ae1' || buffer.length < 512 || !buffer.includes(Buffer.from('WordDocument','utf16le'))) throw new Error('Invalid Word .doc document');
  } else {
    let entries;
    try {
      entries = unzipSync(buffer, {filter: entry => {
        if (entry.name === '[Content_Types].xml' || entry.name === 'word/document.xml') {
          if (entry.originalSize > 4 * 1024 * 1024) throw new Error('Document expands beyond the permitted size');
          return true;
        }
        if (/vbaProject\.bin$/i.test(entry.name)) throw new Error('Macro-enabled documents are not supported');
        return false;
      }});
    } catch { throw new Error('Invalid or oversized Word .docx document'); }
    if (!entries['[Content_Types].xml'] || !entries['word/document.xml'] || !strFromU8(entries['word/document.xml']).includes('wordprocessingml')) throw new Error('File is not a Word .docx document');
  }
  return {buffer,ext,mimetype:MIME[ext],filename:path.basename(filename).replace(/[^a-zA-Z0-9._ -]/g,'_').slice(-120)};
}
async function storeAbstractDocument(document, storage) {
  if (storage) return storage.storeDocument(document);
  fs.mkdirSync(DOCUMENT_DIR,{recursive:true});
  const filename = `${randomUUID()}.${document.ext}`;
  fs.writeFileSync(path.join(DOCUMENT_DIR,filename),document.buffer);
  return `local-abstract://${filename}`;
}
module.exports = {validateAbstractDocument,storeAbstractDocument,DOCUMENT_DIR,MAX_DOCUMENT_SIZE};
