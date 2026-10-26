const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const express = require('express');
const { InMemoryDb } = require('./dbFallback');

let Database;
try {
  Database = require('better-sqlite3');
} catch (loadErr) {
  console.warn('[DB] better-sqlite3 native driver not loadable; activating InMemoryDb fallback:', loadErr.message);
}

const {
  generateRefId,
  getSmtpConfig,
  handleRegistrationEmails,
  sendMail,
  sendSubmissionEmails
} = require('./mailer');
const {
  handlePaymentValidationAndStorage,
  validatePaymentRef,
  validatePaymentProofPayload
} = require('./paymentValidator');

const {validateAbstractDocument,storeAbstractDocument,DOCUMENT_DIR} = require('./abstractDocument');
const { registrationAmount } = require('./public/registration-pricing');
const app = express();

// Initialize Database (handles Vercel Serverless /tmp writable directory or InMemoryDb fallback)
const permanentStorage = require('./supabaseStorage').getSupabaseStorage();
let db;
if (permanentStorage) {
  db = permanentStorage;
} else if (Database) {
  try {
    let dbPath;
    if (process.env.VERCEL) {
      dbPath = path.join('/tmp', 'nipercon.db');
      const sourceDb = path.join(__dirname, 'nipercon.db');
      if (!fs.existsSync(dbPath) && fs.existsSync(sourceDb)) {
        try {
          fs.copyFileSync(sourceDb, dbPath);
        } catch (err) {
          console.warn('Could not copy initial db to /tmp:', err.message);
        }
      }
    } else {
      dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'nipercon.db');
    }
    db = new Database(dbPath);
  } catch (e) {
    console.warn('SQLite file initialization failed, using in-memory database:', e.message);
    try {
      db = new Database(':memory:');
    } catch (memErr) {
      db = new InMemoryDb(process.env.VERCEL ? '/tmp/nipercon_data.json' : null);
    }
  }
} else {
  db = new InMemoryDb(process.env.VERCEL ? '/tmp/nipercon_data.json' : null);
}

// Initialize Schema
db.exec(`
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  category TEXT NOT NULL, tier TEXT NOT NULL,
  workshop INTEGER DEFAULT 0,
  amount REAL NOT NULL, currency TEXT DEFAULT 'INR',
  ref_id TEXT,
  payment_ref TEXT,
  payment_proof TEXT,
  proof_filename TEXT,
  proof_mimetype TEXT,
  proof_size INTEGER,
  proof_uploaded_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS abstracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL, email TEXT NOT NULL,
  title TEXT NOT NULL, category TEXT, body TEXT NOT NULL,
  ref_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, email TEXT, message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sponsorships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL, contact_person TEXT NOT NULL,
  email TEXT NOT NULL, phone TEXT,
  tier TEXT NOT NULL, amount REAL NOT NULL, notes TEXT,
  ref_id TEXT,
  payment_ref TEXT,
  payment_proof TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mail_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL,
  ref_id TEXT,
  status TEXT NOT NULL,
  message_id TEXT,
  error_msg TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

try { db.exec(`ALTER TABLE registrations ADD COLUMN affiliation TEXT NOT NULL DEFAULT '';`); } catch {}

// Safe column migrations for existing databases
try { db.exec(`ALTER TABLE registrations ADD COLUMN ref_id TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE registrations ADD COLUMN payment_ref TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE registrations ADD COLUMN payment_proof TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE registrations ADD COLUMN proof_filename TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE registrations ADD COLUMN proof_mimetype TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE registrations ADD COLUMN proof_size INTEGER;`); } catch (e) {}
try { db.exec(`ALTER TABLE registrations ADD COLUMN proof_uploaded_at TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE sponsorships ADD COLUMN ref_id TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE sponsorships ADD COLUMN payment_ref TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE sponsorships ADD COLUMN payment_proof TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE abstracts ADD COLUMN ref_id TEXT;`); } catch (e) {}

for (const column of ['document_path TEXT','document_filename TEXT','document_mimetype TEXT','document_size INTEGER', 'preference TEXT']) {
  try { db.exec(`ALTER TABLE abstracts ADD COLUMN ${column}`); } catch {}
}

const TARIFF = {
  early:   { student: 3500, inhouse_student: 2000, faculty: 4500, corporate: 6000, workshop: 600 },
  regular: { student: 4000, inhouse_student: 2000, faculty: 5500, corporate: 7500, workshop: 600 },
  spot:    { student: 4500, inhouse_student: 2000, faculty: 6500, corporate: 9000, workshop: 600 }
};

function currentTier(customDate) {
  const now = customDate || new Date();
  if (now < new Date('2026-11-10T00:00:00+05:30')) return 'early';
  if (now < new Date('2026-12-16T00:00:00+05:30')) return 'regular';
  return 'spot';
}

app.post('/api/internal/mail-events',express.raw({type:'application/json',limit:'256kb'}),(req,res)=>{
  if(!permanentStorage)return res.status(503).end();
  return require('./secretariat').handleMailEvent({req,res,storage:permanentStorage});
});
app.use(express.json({ limit: '10mb' }));
// Vercel's temporary filesystem cannot safely retain conference submissions.
app.use((req, res, next) => {
  if (process.env.VERCEL && !permanentStorage && req.method === 'POST') {
    return res.status(503).json({error:'Registration storage is not configured. Please contact the Secretariat; do not submit payment proofs yet.'});
  }
  next();
});
if (fs.existsSync(path.join(__dirname, 'dist'))) {
  app.use(express.static(path.join(__dirname, 'dist')));
}
app.use(express.static(path.join(__dirname, 'public')));
if (process.env.VERCEL) {
  app.use('/uploads', express.static(path.join('/tmp', 'uploads')));
}

app.get('/secretariat/reset',(req,res)=>res.sendFile(path.join(__dirname,'public','secretariat-reset.html')));
app.get('/secretariat',(req,res)=>res.sendFile(path.join(__dirname,'public','secretariat.html')));

app.get('/assets/jspdf.umd.min.js', (req, res) => {
  res.sendFile(require.resolve('jspdf/dist/jspdf.umd.min.js'));
});

app.get(['/api/tariff', '/tariff'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const tier = currentTier();
  res.json({ tier, prices: TARIFF[tier], all: TARIFF });
});

app.get(['/api/health', '/health'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ status: 'ok', time: new Date().toISOString(), storage: permanentStorage ? 'supabase' : 'local', durableStorage: Boolean(permanentStorage), submissionsEnabled: !process.env.VERCEL || Boolean(permanentStorage) });
});

// Endpoint: Standalone Payment Proof Pre-Validation & Metadata Inspection
app.post(['/api/validate-payment-proof', '/validate-payment-proof'], async (req, res) => {
  try {
    const { payment_ref, payment_proof, proof_filename } = req.body;
    const tempRef = generateRefId('CHK');
    const result = await handlePaymentValidationAndStorage({
      payment_ref,
      payment_proof,
      original_filename: proof_filename,
      ref_id: tempRef
    });

    if (!result.success) {
      return res.status(400).json({ valid: false, error: result.error });
    }

    res.json({
      valid: true,
      payment_ref: result.payment_ref,
      proof_url: result.payment_proof_url,
      metadata: result.metadata
    });
  } catch (err) {
    console.error('[VALIDATE PAYMENT ERROR]', err);
    res.status(500).json({ valid: false, error: 'Payment validation error: ' + err.message });
  }
});

// Endpoint: Delegate Registration
// Validates registration inputs, verifies payment reference & proof,
// stores proof file and metadata, and dispatches confirmation emails.
app.post(['/api/register', '/register'], async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone,
      affiliation,
      category,
      workshop,
      payment_ref,
      payment_proof,
      proof_filename
    } = req.body;

    if (!full_name || !email || !category || typeof affiliation !== 'string' || affiliation.trim().length < 2 || affiliation.length > 300) {
      return res.status(400).json({ error: 'Full name, email, institutional affiliation and delegate category are required.' });
    }

    const tier = currentTier();
    const t = TARIFF[tier] || TARIFF.early;
    let amount;
    try { amount = registrationAmount({category,workshop,affiliation},t); }
    catch (err) { return res.status(400).json({error:err.message}); }
    const currency = 'INR';
    const ref_id = generateRefId('DEL');

    // Server-side payment validation & storage
    const paymentValidation = await handlePaymentValidationAndStorage({
      payment_ref,
      payment_proof,
      original_filename: proof_filename,
      ref_id
    });

    if (!paymentValidation.success) {
      return res.status(400).json({ error: paymentValidation.error });
    }

    const { payment_ref: validatedRef, payment_proof_url, metadata } = paymentValidation;

    const info = await db.prepare(`
      INSERT INTO registrations (
        full_name, email, phone, category, tier, workshop,
        amount, currency, ref_id, payment_ref, payment_proof,
        proof_filename, proof_mimetype, proof_size, proof_uploaded_at, affiliation
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      full_name,
      email,
      phone || '',
      category,
      tier,
      workshop ? 1 : 0,
      amount,
      currency,
      ref_id,
      validatedRef,
      payment_proof_url,
      metadata.proof_filename,
      metadata.proof_mimetype,
      metadata.proof_size,
      metadata.proof_uploaded_at,
      affiliation.trim()
    );

    // Finish both delivery attempts before Vercel can suspend this invocation.
    const emailResults = await handleRegistrationEmails(db, {
        full_name,
        email,
        phone: phone || '',
        affiliation: affiliation.trim(),
        category,
        tier,
        workshop: Boolean(workshop),
        amount,
        currency,
        ref_id,
        payment_ref: validatedRef,
        has_proof: true,
        proof_url: payment_proof_url,
        proof_metadata: metadata
      });

    res.json({
      id: info.lastInsertRowid,
      ref_id,
      tier,
      amount,
      currency,
      affiliation: affiliation.trim(),
      category,
      payment_ref: validatedRef,
      payment_proof: payment_proof_url,
      proof_metadata: metadata,
      email_status: {
        delegate: emailResults.delegate.status,
        organizer: emailResults.organizer.status
      }
    });
  } catch (err) {
    console.error('[REGISTRATION HANDLER ERROR]', err);
    res.status(500).json({ error: 'Registration processing error: ' + err.message });
  }
});

app.post(['/api/abstract', '/abstract'], async (req, res) => {
  try {
    const { full_name, email, title, category, preference, document_data, document_filename } = req.body;
    if (!full_name || !email || !title || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Valid author name, email and title are required' });
    let document;
    try { document = validateAbstractDocument(document_data, document_filename); }
    catch (err) { return res.status(400).json({error:err.message}); }
    const ref_id = generateRefId('ABS');
    const document_path = await storeAbstractDocument(document, permanentStorage);
    const info = await db.prepare(`
      INSERT INTO abstracts (full_name,email,title,category,body,ref_id,document_path,document_filename,document_mimetype,document_size,preference)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(full_name, email, title, category || '', '', ref_id, document_path, document.filename, document.mimetype, document.buffer.length, preference || 'Oral');
    const email_status = await sendSubmissionEmails(db, 'ABSTRACT', {full_name,email,title,category,preference:preference || 'Oral',ref_id}, [{filename:document.filename,content:document.buffer,contentType:document.mimetype}]);
    res.json({ id: info.lastInsertRowid, ref_id, email_status });
  } catch (err) {
    console.error('[ABSTRACT SUBMISSION ERROR]', err.message);
    res.status(500).json({ error: 'Could not save abstract. Please contact the Secretariat.' });
  }
});

app.post(['/api/contact', '/contact'], async (req, res) => {
  try {
    const { name, email, message } = req.body;
    await db.prepare('INSERT INTO contacts (name,email,message) VALUES (?,?,?)').run(name || '', email || '', message || '');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const SPONSORSHIP_PRICES = { Platinum:100000, Gold:50000, Silver:25000, Philanthropic:0, Custom:0 };
app.post(['/api/sponsorship', '/sponsorship'], async (req, res) => {
  try {
    const { company_name, contact_person, email, phone, tier, notes, payment_ref, payment_proof, proof_filename } = req.body;
    if (!company_name || !contact_person || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') || !Object.hasOwn(SPONSORSHIP_PRICES,tier)) {
      return res.status(400).json({ error: 'Valid company, contact, email and sponsorship tier are required' });
    }
    if (tier === 'Philanthropic' && (payment_ref || payment_proof)) return res.status(400).json({error:'Please agree the contribution with the Secretariat before payment. Submit an inquiry without payment proof.'});
    const ref_id = generateRefId('SPON');
    const amount = Math.round(SPONSORSHIP_PRICES[tier] * 1.18);
    let proofUrl = '', validatedRef = '', attachments = [];
    if (payment_ref || payment_proof) {
      const validation = await handlePaymentValidationAndStorage({payment_ref,payment_proof,original_filename:proof_filename,ref_id});
      if (!validation.success) return res.status(400).json({error:validation.error});
      proofUrl = validation.payment_proof_url;
      validatedRef = validation.payment_ref;
      const proof = validatePaymentProofPayload(payment_proof,proof_filename);
      attachments = [{filename:validation.metadata.proof_filename || `PaymentProof.${proof.ext}`,content:proof.buffer,contentType:proof.mimetype}];
    }
    const info = await db.prepare(`
      INSERT INTO sponsorships (company_name, contact_person, email, phone, tier, amount, notes, ref_id, payment_ref, payment_proof)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(company_name, contact_person, email, phone || '', tier, amount, notes || '', ref_id, validatedRef, proofUrl);
    const email_status = await sendSubmissionEmails(db,'SPONSORSHIP',{company_name,contact_person,email,tier,amount,notes,ref_id,payment_ref:validatedRef},attachments);
    res.json({ id: info.lastInsertRowid, ref_id, success: true, tier, amount, payment_ref:validatedRef, email_status });
  } catch (err) {
    console.error('[SPONSORSHIP ERROR]',err.message);
    res.status(500).json({ error: 'Could not save sponsorship. Please contact the Secretariat.' });
  }
});

// Approved accounts and MFA protect the dedicated Secretariat workspace.
const {createSecretariat,processMailQueue} = require('./secretariat');
if (permanentStorage) app.use('/api/secretariat',createSecretariat({storage:permanentStorage}));
else app.use('/api/secretariat',(req,res)=>res.status(503).json({error:'Configure Supabase to use the secured Secretariat workspace'}));
app.all('/api/internal/mail-worker',async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const configured=process.env.MAIL_WORKER_SECRET;
  const actual=Buffer.from(req.headers.authorization || '');
  const expected=Buffer.from('Bearer '+configured);
  const crypto=require('node:crypto');
  if(!configured || configured.length<32 || actual.length!==expected.length || !crypto.timingSafeEqual(actual,expected))return res.status(403).json({error:'Forbidden'});
  if(req.method!=='POST')return res.status(405).json({error:'Use POST'});
  try { if(!permanentStorage)throw Error('Permanent storage unavailable');res.json({results:await processMailQueue({storage:permanentStorage})}); }
  catch(err){console.error('[MAIL WORKER]',err.message);res.status(503).json({error:'Mail worker unavailable; check configuration and queue'});}
});
// Production no longer accepts the shared token or tokens embedded in URLs.
app.use(['/api/admin','/admin'],(req,res,next)=>{
  if(!process.env.VERCEL && process.env.NODE_ENV!=='production')return next();
  res.status(410).json({error:'Use the secured /secretariat workspace'});
});

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || (process.env.VERCEL ? null : 'change-me');

app.get('/api/admin/abstract-document/:filename', (req,res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.status(403).json({error:'Forbidden'});
  if (!/^[a-f0-9-]{36}\.docx?$/.test(req.params.filename)) return res.status(404).end();
  res.setHeader('Cache-Control','no-store');
  res.download(path.join(DOCUMENT_DIR,req.params.filename));
});

for (const table of ['registrations', 'abstracts', 'sponsorships', 'mail_logs']) {
  const route = table === 'mail_logs' ? 'mail-logs' : table;
  app.get([`/api/admin/${route}`, `/admin/${route}`], async (req, res) => {
    if (req.query.token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
    res.setHeader('Cache-Control', 'no-store');
    try {
      const rows = await db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC${table === 'mail_logs' ? ' LIMIT 100' : ''}`).all();
      if (table === 'abstracts') {
        for (const row of rows) if (row.document_path?.startsWith('local-abstract://')) row.document_path = '/api/admin/abstract-document/' + encodeURIComponent(row.document_path.slice('local-abstract://'.length)) + '?token=' + encodeURIComponent(ADMIN_TOKEN);
      }
      res.json(rows);
    } catch (err) {
      console.error('[ADMIN STORAGE]', err.message);
      res.status(503).json({error:'Could not load conference records'});
    }
  });
}

// Configuration check endpoint for Secretariat admin
app.get(['/api/admin/smtp-status', '/admin/smtp-status'], (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  const config = getSmtpConfig();
  res.json({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    senderEmail: config.senderEmail && config.senderEmail !== 'secretariat@conference.local'
      ? `${config.senderEmail.replace(/(.{3}).*(@.*)/, '$1***$2')}`
      : (config.senderEmail || 'Not configured'),
    organizerEmail: config.organizerEmail && config.organizerEmail !== 'secretariat@conference.local'
      ? `${config.organizerEmail.replace(/(.{3}).*(@.*)/, '$1***$2')}`
      : (config.organizerEmail || 'Not configured'),
    isConfigured: config.isValid,
    allowedVars: config.allowedVars,
    missingVars: config.missing
  });
});

const PORT = parseInt(process.env.APP_PORT || (process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : 3000), 10);
let server;
if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', () => console.log(`NeuroMet Pharmacon-2027 running at http://0.0.0.0:${PORT}`));
}

module.exports = { app, db, TARIFF, currentTier, server };
