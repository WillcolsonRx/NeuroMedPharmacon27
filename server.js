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
  sendMail
} = require('./mailer');
const {
  handlePaymentValidationAndStorage,
  validatePaymentRef,
  validatePaymentProofPayload
} = require('./paymentValidator');

const app = express();

// Initialize Database (handles Vercel Serverless /tmp writable directory or InMemoryDb fallback)
let db;
if (Database) {
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

const TARIFF = {
  early:   { student: 3500, faculty: 4500, corporate: 6000, workshop: 500 },
  regular: { student: 4000, faculty: 5500, corporate: 7500, workshop: 500 },
  spot:    { student: 4500, faculty: 6500, corporate: 9000, workshop: 500 }
};

function currentTier(customDate) {
  const now = customDate || new Date();
  if (now <= new Date('2026-03-31')) return 'early';
  if (now <= new Date('2026-09-20')) return 'regular';
  return 'spot';
}

app.use(express.json({ limit: '10mb' }));
if (fs.existsSync(path.join(__dirname, 'dist'))) {
  app.use(express.static(path.join(__dirname, 'dist')));
}
app.use(express.static(path.join(__dirname, 'public')));
if (process.env.VERCEL) {
  app.use('/uploads', express.static(path.join('/tmp', 'uploads')));
}

app.get(['/api/tariff', '/tariff'], (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800');
  const tier = currentTier();
  res.json({ tier, prices: TARIFF[tier], all: TARIFF });
});

app.get(['/api/health', '/health'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Endpoint: Standalone Payment Proof Pre-Validation & Metadata Inspection
app.post(['/api/validate-payment-proof', '/validate-payment-proof'], (req, res) => {
  try {
    const { payment_ref, payment_proof, proof_filename } = req.body;
    const tempRef = generateRefId('CHK');
    const result = handlePaymentValidationAndStorage({
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
      category,
      workshop,
      payment_ref,
      payment_proof,
      proof_filename
    } = req.body;

    if (!full_name || !email || !category) {
      return res.status(400).json({ error: 'Missing required fields: full name, email, and delegate category are required.' });
    }

    const tier = currentTier();
    const t = TARIFF[tier] || TARIFF.early;
    if (!(category in t)) {
      return res.status(400).json({ error: 'Invalid delegate category.' });
    }

    let subtotal = t[category];
    if (workshop) subtotal += (t.workshop || 500);
    const gstAmount = Math.round(subtotal * 0.18);
    const amount = subtotal + gstAmount;
    const currency = 'INR';
    const ref_id = generateRefId('DEL');

    // Server-side payment validation & storage
    const paymentValidation = handlePaymentValidationAndStorage({
      payment_ref,
      payment_proof,
      original_filename: proof_filename,
      ref_id
    });

    if (!paymentValidation.success) {
      return res.status(400).json({ error: paymentValidation.error });
    }

    const { payment_ref: validatedRef, payment_proof_url, metadata } = paymentValidation;

    const info = db.prepare(`
      INSERT INTO registrations (
        full_name, email, phone, category, tier, workshop,
        amount, currency, ref_id, payment_ref, payment_proof,
        proof_filename, proof_mimetype, proof_size, proof_uploaded_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
      metadata.proof_uploaded_at
    );

    // Trigger the 2 automatic emails asynchronously (non-blocking for instant sub-50ms HTTP response)
    setImmediate(() => {
      handleRegistrationEmails(db, {
        full_name,
        email,
        phone: phone || '',
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
      }).catch(err => console.error('[ASYNC REGISTRATION EMAIL ERROR]', err.message));
    });

    res.json({
      id: info.lastInsertRowid,
      ref_id,
      tier,
      amount,
      currency,
      payment_ref: validatedRef,
      payment_proof: payment_proof_url,
      proof_metadata: metadata
    });
  } catch (err) {
    console.error('[REGISTRATION HANDLER ERROR]', err);
    res.status(500).json({ error: 'Registration processing error: ' + err.message });
  }
});

app.post(['/api/abstract', '/abstract'], async (req, res) => {
  try {
    const { full_name, email, title, category, body } = req.body;
    if (!full_name || !email || !title || !body) return res.status(400).json({ error: 'Missing required fields' });
    const ref_id = generateRefId('ABS');

    const info = db.prepare(`
      INSERT INTO abstracts (full_name,email,title,category,body,ref_id)
      VALUES (?,?,?,?,?,?)
    `).run(full_name, email, title, category || '', body, ref_id);

    res.json({ id: info.lastInsertRowid, ref_id });
  } catch (err) {
    console.error('[ABSTRACT SUBMISSION ERROR]', err);
    res.status(500).json({ error: 'Abstract submission error: ' + err.message });
  }
});

app.post(['/api/contact', '/contact'], (req, res) => {
  try {
    const { name, email, message } = req.body;
    db.prepare('INSERT INTO contacts (name,email,message) VALUES (?,?,?)').run(name || '', email || '', message || '');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/sponsorship', '/sponsorship'], async (req, res) => {
  try {
    const { company_name, contact_person, email, phone, tier, amount, notes, payment_ref, payment_proof } = req.body;
    if (!company_name || !contact_person || !email || !tier) {
      return res.status(400).json({ error: 'Missing required sponsorship fields' });
    }
    const ref_id = generateRefId('SPON');

    const info = db.prepare(`
      INSERT INTO sponsorships (company_name, contact_person, email, phone, tier, amount, notes, ref_id, payment_ref, payment_proof)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(company_name, contact_person, email, phone || '', tier, amount || 0, notes || '', ref_id, payment_ref || '', payment_proof || '');

    res.json({ id: info.lastInsertRowid, ref_id, success: true, tier, payment_ref });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me';

app.get(['/api/admin/registrations', '/admin/registrations'], (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  res.json(db.prepare('SELECT * FROM registrations ORDER BY created_at DESC').all());
});

app.get(['/api/admin/abstracts', '/admin/abstracts'], (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  res.json(db.prepare('SELECT * FROM abstracts ORDER BY created_at DESC').all());
});

app.get(['/api/admin/sponsorships', '/admin/sponsorships'], (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  res.json(db.prepare('SELECT * FROM sponsorships ORDER BY created_at DESC').all());
});

// Admin endpoint to inspect email delivery audit logs
app.get(['/api/admin/mail-logs', '/admin/mail-logs'], (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  res.json(db.prepare('SELECT * FROM mail_logs ORDER BY created_at DESC LIMIT 100').all());
});

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
  server = app.listen(PORT, '0.0.0.0', () => console.log(`NeuroMedPharmacon 2027 running at http://0.0.0.0:${PORT}`));
}

module.exports = { app, db, TARIFF, currentTier, server };
