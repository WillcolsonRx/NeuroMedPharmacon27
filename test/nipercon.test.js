process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Database = require('better-sqlite3');
const { currentTier, TARIFF, app } = require('../server.js');

test('Tier calculation auto-switches correctly by date', () => {
  assert.equal(currentTier(new Date('2026-10-23T12:00:00Z')), 'early');
  assert.equal(currentTier(new Date('2026-11-09T23:59:59+05:30')), 'early');
  assert.equal(currentTier(new Date('2026-11-10T00:00:00+05:30')), 'regular');
  assert.equal(currentTier(new Date('2026-12-09T23:59:59+05:30')), 'regular');
  assert.equal(currentTier(new Date('2026-12-10T00:00:00+05:30')), 'spot');
});

test('TARIFF contains expected rate structures for all tiers', () => {
  ['early', 'regular', 'spot'].forEach(tier => {
    assert.ok(TARIFF[tier], `Missing tier ${tier}`);
    assert.equal(typeof TARIFF[tier].student, 'number');
    assert.equal(typeof TARIFF[tier].faculty, 'number');
    assert.equal(typeof TARIFF[tier].corporate, 'number');
    assert.equal(typeof TARIFF[tier].workshop, 'number');
  });
  // Check specific rates: Scholar/PG = 3500, Faculty = 4500, Corporate = 6000
  assert.equal(TARIFF.early.student, 3500);
  assert.equal(TARIFF.early.faculty, 4500);
  assert.equal(TARIFF.early.corporate, 6000);
  assert.equal(TARIFF.early.workshop, 500);
});

test('Database tables are properly initialized and handle inserts', () => {
  const memDb = new Database(':memory:');
  memDb.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
    category TEXT NOT NULL, tier TEXT NOT NULL,
    workshop INTEGER DEFAULT 0,
    amount REAL NOT NULL, currency TEXT DEFAULT 'INR',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS abstracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL, email TEXT NOT NULL,
    title TEXT NOT NULL, category TEXT, body TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT, message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );`);

  // Test registration insertion
  const regStmt = memDb.prepare(`INSERT INTO registrations (full_name,email,phone,category,tier,workshop,amount,currency) VALUES (?,?,?,?,?,?,?,?)`);
  const regInfo = regStmt.run('Dr. Jane Doe', 'jane@example.com', '9876543210', 'faculty', 'spot', 1, 8500, 'INR');
  assert.equal(regInfo.changes, 1);
  const regRow = memDb.prepare('SELECT * FROM registrations WHERE id = ?').get(regInfo.lastInsertRowid);
  assert.equal(regRow.full_name, 'Dr. Jane Doe');
  assert.equal(regRow.currency, 'INR');
  assert.equal(regRow.amount, 8500);

  // Test corporate registration
  const corpInfo = regStmt.run('Mr. Smith', 'smith@example.org', '', 'corporate', 'early', 0, 6000, 'INR');
  const corpRow = memDb.prepare('SELECT * FROM registrations WHERE id = ?').get(corpInfo.lastInsertRowid);
  assert.equal(corpRow.currency, 'INR');
  assert.equal(corpRow.amount, 6000);

  // Test abstract insertion
  const absStmt = memDb.prepare(`INSERT INTO abstracts (full_name,email,title,category,body) VALUES (?,?,?,?,?)`);
  const absInfo = absStmt.run('Dr. Jane Doe', 'jane@example.com', 'Novel Drug Delivery', 'Pharmaceutics', 'Abstract body text...');
  assert.equal(absInfo.changes, 1);
  const absRow = memDb.prepare('SELECT * FROM abstracts WHERE id = ?').get(absInfo.lastInsertRowid);
  assert.equal(absRow.title, 'Novel Drug Delivery');

  // Test contact insertion
  const cntStmt = memDb.prepare(`INSERT INTO contacts (name,email,message) VALUES (?,?,?)`);
  const cntInfo = cntStmt.run('Delegate Inquiry', 'inquiry@example.com', 'Hotel accommodations info?');
  assert.equal(cntInfo.changes, 1);
  const cntRow = memDb.prepare('SELECT * FROM contacts WHERE id = ?').get(cntInfo.lastInsertRowid);
  assert.equal(cntRow.name, 'Delegate Inquiry');
});

test('HTTP API routes handle registration, abstracts, contacts, and admin endpoints', async () => {
  const testServer = app.listen(0);
  const port = testServer.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. GET /api/tariff
    const tariffRes = await fetch(`${baseUrl}/api/tariff`);
    assert.equal(tariffRes.status, 200);
    const tariffJson = await tariffRes.json();
    assert.ok(tariffJson.tier);
    assert.ok(tariffJson.prices);
    assert.ok(tariffJson.all);

    // 2. POST /api/register - student scholar with valid payment proof
    const regRes = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Test Scholar',
        email: 'scholar@example.com',
        phone: '1234567890',
        category: 'student',
        workshop: 1,
        payment_ref: 'SBI-UTR-998822334411',
        payment_proof: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII=',
        proof_filename: 'sbi_receipt_scholar.png'
      })
    });
    assert.equal(regRes.status, 200);
    const regJson = await regRes.json();
    assert.ok(regJson.id);
    assert.ok(regJson.ref_id && regJson.ref_id.startsWith('NMP27-DEL-'), 'Expected ref_id on delegate registration');
    assert.equal(regJson.currency, 'INR');
    assert.equal(regJson.payment_ref, 'SBI-UTR-998822334411');
    assert.ok(regJson.payment_proof && regJson.payment_proof.startsWith('/uploads/payment_proofs/'));
    assert.ok(regJson.proof_metadata);
    assert.equal(regJson.proof_metadata.proof_mimetype, 'image/png');
    assert.ok(regJson.proof_metadata.proof_size > 0);
    assert.ok(regJson.amount > 0);

    // 3. POST /api/register - rejection when payment proof is missing
    const noProofRes = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Prof. Scientist',
        email: 'faculty@example.com',
        category: 'faculty',
        workshop: 0,
        payment_ref: 'UTR-MISSING-PROOF'
      })
    });
    assert.equal(noProofRes.status, 400);
    const noProofJson = await noProofRes.json();
    assert.ok(noProofJson.error);

    // 4. POST /api/register - rejection when transaction reference is empty or missing
    const noRefRes = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Prof. Scientist',
        email: 'faculty@example.com',
        category: 'faculty',
        workshop: 0,
        payment_ref: '   ',
        payment_proof: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII='
      })
    });
    assert.equal(noRefRes.status, 400);

    // 5. POST /api/register - rejection when proof has invalid/spoofed content
    const spoofRes = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Prof. Scientist',
        email: 'faculty@example.com',
        category: 'faculty',
        workshop: 0,
        payment_ref: 'SBI-UTR-882233',
        payment_proof: 'data:image/png;base64,VGhpcyBpcyBhIHBsYWluIHRleHQgZmlsZSBub3QgYSBQTkcgaW1hZ2U='
      })
    });
    assert.equal(spoofRes.status, 400);

    // 6. POST /api/validate-payment-proof - standalone pre-validation endpoint
    const valRes = await fetch(`${baseUrl}/api/validate-payment-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_ref: 'PAYTM-REF-55443322',
        payment_proof: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
        proof_filename: 'paytm_transaction.jpg'
      })
    });
    assert.equal(valRes.status, 200);
    const valJson = await valRes.json();
    assert.equal(valJson.valid, true);
    assert.equal(valJson.payment_ref, 'PAYTM-REF-55443322');
    assert.ok(valJson.proof_url && valJson.proof_url.startsWith('/uploads/payment_proofs/'));
    assert.equal(valJson.metadata.proof_mimetype, 'image/jpeg');

    // 7. POST /api/register - faculty delegate with valid JPEG proof
    const facultyRes = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Prof. Scientist',
        email: 'faculty@example.com',
        category: 'faculty',
        workshop: 0,
        payment_ref: 'HDFC-UTR-7788990011',
        payment_proof: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
        proof_filename: 'hdfc_receipt.jpg'
      })
    });
    assert.equal(facultyRes.status, 200);
    const facultyJson = await facultyRes.json();
    assert.equal(facultyJson.currency, 'INR');
    assert.deepEqual(facultyJson.email_status, { delegate: 'simulated', organizer: 'simulated' });
    assert.ok(facultyJson.ref_id && facultyJson.ref_id.startsWith('NMP27-DEL-'));
    assert.equal(facultyJson.payment_ref, 'HDFC-UTR-7788990011');
    assert.equal(facultyJson.proof_metadata.proof_mimetype, 'image/jpeg');

    // 8. POST /api/register - missing general fields (e.g. no name)
    const badReg = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'no_name@pharma.org' })
    });
    assert.equal(badReg.status, 400);

    // 5. POST /api/abstract
    const absRes = await fetch(`${baseUrl}/api/abstract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Dr. Researcher',
        email: 'research@example.com',
        title: 'Targeted Nano-carriers in Cancer Chemotherapy',
        category: 'Drug Discovery',
        preference: 'Poster',
        document_filename: 'abstract.docx',
        document_data: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + Buffer.from(require('fflate').zipSync({'[Content_Types].xml':Buffer.from('<Types/>'), 'word/document.xml':Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>')})).toString('base64')
      })
    });
    assert.equal(absRes.status, 200);
    const absJson = await absRes.json();
    assert.ok(absJson.id);
    assert.deepEqual(absJson.email_status,{delegate:'simulated',organizer:'simulated'});
    assert.ok(absJson.ref_id && absJson.ref_id.startsWith('NMP27-ABS-'));

    // 6. POST /api/contact
    const cntRes = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Conference Attendee',
        email: 'attendee@example.com',
        message: 'Where can I find the bus shuttle schedule?'
      })
    });
    assert.equal(cntRes.status, 200);
    const cntJson = await cntRes.json();
    assert.equal(cntJson.ok, true);

    // 7. GET /api/admin/registrations - forbidden without token
    const unauthAdmin = await fetch(`${baseUrl}/api/admin/registrations`);
    assert.equal(unauthAdmin.status, 403);

    const token = process.env.ADMIN_TOKEN || 'change-me';
    // 8. GET /api/admin/registrations - authorized
    const authAdmin = await fetch(`${baseUrl}/api/admin/registrations?token=${encodeURIComponent(token)}`);
    assert.equal(authAdmin.status, 200);
    const registrationsList = await authAdmin.json();
    assert.ok(Array.isArray(registrationsList));
    assert.ok(registrationsList.length >= 2);
    
    // Verify payment reference and proof metadata are preserved in the database
    const scholarRecord = registrationsList.find(r => r.email === 'scholar@example.com');
    assert.ok(scholarRecord, 'Expected scholar registration in admin list');
    assert.equal(scholarRecord.payment_ref, 'SBI-UTR-998822334411');
    assert.ok(scholarRecord.payment_proof && scholarRecord.payment_proof.startsWith('/uploads/payment_proofs/'));
    assert.equal(scholarRecord.proof_filename, 'sbi_receipt_scholar.png');
    assert.equal(scholarRecord.proof_mimetype, 'image/png');
    assert.ok(scholarRecord.proof_size > 0);
    assert.ok(scholarRecord.proof_uploaded_at);

    // 9. GET /api/admin/abstracts - authorized
    const authAbs = await fetch(`${baseUrl}/api/admin/abstracts?token=${encodeURIComponent(token)}`);
    assert.equal(authAbs.status, 200);
    const abstractsList = await authAbs.json();
    assert.ok(Array.isArray(abstractsList));
    assert.ok(abstractsList.length >= 1);
    assert.equal(abstractsList[0].document_filename, 'abstract.docx');
    const wordDownload = await fetch(baseUrl + abstractsList[0].document_path);
    assert.equal(wordDownload.status,200);
    assert.ok((await wordDownload.arrayBuffer()).byteLength > 0);
    const protectedDownload = await fetch(baseUrl + abstractsList[0].document_path.split('?')[0]);
    assert.equal(protectedDownload.status,403);

    // 10. POST /api/sponsorship & GET /api/admin/sponsorships
    const sponRes = await fetch(`${baseUrl}/api/sponsorship`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name: 'PharmaTech India Ltd',
        contact_person: 'Rajiv Sharma',
        email: 'partnerships@pharmatech.in',
        phone: '+91 98765 43210',
        tier: 'Platinum',
        amount: 100000,
        notes: 'Interested in Platinum booth and 2 complimentary registrations.',
        payment_ref: 'SPON-UTR-112233',
        payment_proof: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      })
    });
    assert.equal(sponRes.status, 200);
    const sponJson = await sponRes.json();
    assert.ok(sponJson.id);
    assert.equal(sponJson.tier, 'Platinum');
    assert.equal(sponJson.amount,118000);
    assert.deepEqual(sponJson.email_status,{delegate:'simulated',organizer:'simulated'});
    assert.equal(sponJson.payment_ref, 'SPON-UTR-112233');
    assert.ok(sponJson.ref_id && sponJson.ref_id.startsWith('NMP27-SPON-'));

    const authSpon = await fetch(`${baseUrl}/api/admin/sponsorships?token=${encodeURIComponent(token)}`);
    assert.equal(authSpon.status, 200);
    const sponList = await authSpon.json();
    assert.ok(Array.isArray(sponList));
    assert.ok(sponList.length >= 1);
    assert.equal(sponList[0].company_name, 'PharmaTech India Ltd');

    // 11. GET /api/admin/mail-logs - Verify both automatic emails were dispatched
    const authMail = await fetch(`${baseUrl}/api/admin/mail-logs?token=${encodeURIComponent(token)}`);
    assert.equal(authMail.status, 200);
    const mailLogs = await authMail.json();
    assert.ok(Array.isArray(mailLogs));
    assert.ok(mailLogs.length >= 2, 'Expected at least 2 logged emails from delegate registration');

    const delegateMails = mailLogs.filter(m => m.type === 'DELEGATE_CONFIRMATION');
    const organizerMails = mailLogs.filter(m => m.type === 'ORGANIZER_NOTIFICATION');
    assert.ok(delegateMails.length >= 1, 'Expected at least 1 delegate confirmation email');
    assert.ok(organizerMails.length >= 1, 'Expected at least 1 organizer notification email');

    // 12. GET /api/admin/smtp-status - Verify 6-variable configuration and requireTLS: true
    const smtpStatusRes = await fetch(`${baseUrl}/api/admin/smtp-status?token=${encodeURIComponent(token)}`);
    assert.equal(smtpStatusRes.status, 200);
    const smtpStatus = await smtpStatusRes.json();
    assert.equal(smtpStatus.requireTLS, true, 'STARTTLS requireTLS must be true');
    assert.ok(smtpStatus.host);
    assert.ok(typeof smtpStatus.port === 'number');
    assert.deepEqual(smtpStatus.allowedVars, [
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_SECURE',
      'SMTP_USER',
      'SMTP_PASS',
      'ORGANIZER_EMAIL'
    ], 'Allowed variables must be exactly the specified 6 variables');

  } finally {
    testServer.close();
  }
});
