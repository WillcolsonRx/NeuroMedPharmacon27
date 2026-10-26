const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const nodemailer = require('nodemailer');

function generateRefId(type = 'DEL') {
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `NMP27-${type.toUpperCase()}-${rand}`;
}

/**
 * The exact six allowed environment variables:
 * SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, and ORGANIZER_EMAIL
 */
const ALLOWED_CONFIG_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'ORGANIZER_EMAIL'
];

/**
 * Validate and retrieve the 6 allowed SMTP configuration variables.
 * Uses SMTP_USER as sender email address.
 * Configures STARTTLS with requireTLS: true.
 */
function getSmtpConfig() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  // Single Gmail account for sending and receiving notifications
  const organizerEmail = process.env.ORGANIZER_EMAIL || user || 'secretariat@conference.local';

  // Environment variable validation: check presence of the 6 variables
  const missing = [];
  if (!process.env.SMTP_HOST) missing.push('SMTP_HOST');
  if (!process.env.SMTP_PORT) missing.push('SMTP_PORT');
  if (process.env.SMTP_SECURE === undefined) missing.push('SMTP_SECURE');
  if (!process.env.SMTP_USER) missing.push('SMTP_USER');
  if (!process.env.SMTP_PASS) missing.push('SMTP_PASS');
  if (!process.env.ORGANIZER_EMAIL) missing.push('ORGANIZER_EMAIL');

  const isValid = Boolean(user && pass);

  return {
    host,
    port,
    secure,
    requireTLS: true,
    auth: { user, pass },
    senderEmail: user || 'secretariat@conference.local',
    organizerEmail,
    isValid,
    missing,
    allowedVars: ALLOWED_CONFIG_KEYS
  };
}

let transporter = null;
let lastUser = null;
let lastPass = null;
let lastPort = null;
let lastHost = null;
let lastSecure = null;

function getTransporter() {
  const config = getSmtpConfig();

  if (!config.auth.user || !config.auth.pass) {
    transporter = null;
    return null;
  }

  // Re-instantiate transporter if credentials or connection parameters change
  if (
    !transporter ||
    lastUser !== config.auth.user ||
    lastPass !== config.auth.pass ||
    lastPort !== config.port ||
    lastHost !== config.host ||
    lastSecure !== config.secure
  ) {
    lastUser = config.auth.user;
    lastPass = config.auth.pass;
    lastPort = config.port;
    lastHost = config.host;
    lastSecure = config.secure;

    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTLS,
      auth: config.auth,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }
  return transporter;
}

/**
 * Dispatch an email using SMTP_USER as sender with STARTTLS
 */
async function sendMail(db, { to, subject, html, text, type = 'GENERAL', refId = null, attachments = [] }) {
  const config = getSmtpConfig();
  // Use SMTP_USER directly as the sender email address
  const from = config.senderEmail;
  const activeTransporter = getTransporter();

  let status = 'logged';
  let messageId = null;
  let errorMsg = null;

  if (process.env.NODE_ENV === 'test') {
    // Automated test mode: simulate email delivery to avoid sending emails over the internet
    status = 'simulated';
    messageId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  } else if (activeTransporter) {
    try {
      const info = await activeTransporter.sendMail({
        from,
        to,
        subject,
        html,
        text,
        attachments
      });
      status = 'sent';
      messageId = info.messageId;
      console.log(`[SMTP SENT] (${type}) Successfully dispatched to ${to} | Ref: ${refId || 'N/A'} | ID: ${messageId}`);
    } catch (err) {
      status = 'failed';
      errorMsg = err.message;
      console.error(`[SMTP ERROR] Failed to send email to ${to}:`, err.message);
      if (err.message && (err.message.includes('534') || err.message.includes('InvalidSecondFactor') || err.message.includes('Application-specific password'))) {
        console.warn('  -> [GMAIL APP PASSWORD NOTICE] Gmail requires a 16-character App Password when 2-Step Verification is active. Generate one at https://myaccount.google.com/apppasswords and set SMTP_PASS.');
      }
    }
  } else {
    status = 'not_configured';
    errorMsg = 'SMTP credentials are not configured.';
  }

  // Persist into mail_logs table for administrative verification
  try {
    if (db) {
      await db.prepare(`
        INSERT INTO mail_logs (recipient, subject, type, ref_id, status, message_id, error_msg, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(to, subject, type, refId || '', status, messageId || '', errorMsg || '');
    }
  } catch (dbErr) {
    console.error('[DB MAIL LOG ERROR]', dbErr.message);
  }

  return { status, messageId, error: errorMsg };
}

function formatCategoryName(cat) {
  if (cat === 'inhouse_student') return 'In-house students';
  if (cat === 'student') return 'Research Scholar / PG Student';
  if (cat === 'faculty') return 'Faculty / Academic Scientist';
  if (cat === 'corporate') return 'Corporate / Industry Delegate';
  return cat;
}

/**
 * EMAIL 1: Registration confirmation email sent to the delegate
 */
function affiliationHtml(value) {
  return String(value || 'Not supplied').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function sendDelegateConfirmation(db, registration) {
  const { full_name, email, affiliation, category, tier, workshop, amount, currency, ref_id, payment_ref } = registration;
  const categoryLabel = formatCategoryName(category);
  const subject = `Registration Confirmation: NeuroMet Pharmacon-2027 [Ref: ${ref_id}]`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 20px; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .header { background: #060e18; color: #ffffff; padding: 24px; text-align: center; border-bottom: 3px solid #cba234; }
        .header h1 { margin: 0 0 4px; font-size: 20px; color: #ffffff; font-family: Georgia, serif; }
        .header p { margin: 0; font-size: 13px; color: #cba234; text-transform: uppercase; letter-spacing: 0.08em; }
        .body { padding: 24px; }
        .ref-box { background: #f0fdf4; border: 1px dashed #16a34a; border-radius: 6px; padding: 14px; margin: 18px 0; text-align: center; }
        .ref-label { font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
        .ref-val { font-size: 24px; font-weight: 700; color: #15803d; font-family: monospace; margin-top: 4px; }
        .details-table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; }
        .details-table td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; }
        .details-table td:first-child { color: #64748b; width: 42%; }
        .details-table td:last-child { font-weight: 600; text-align: right; color: #0f172a; }
        .footer { background: #f8fafc; padding: 16px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>NeuroMet Pharmacon-2027</h1>
          <p>In Collaboration with Indian Pharmacological Society</p>
        </div>
        <div class="body">
          <p>Dear <strong>${full_name}</strong>,</p>
          <p>Your registration for <strong>NeuroMet Pharmacon-2027</strong> has been successfully confirmed.</p>
          
          <div class="ref-box">
            <div class="ref-label">Official Delegate Reference ID</div>
            <div class="ref-val">${ref_id}</div>
          </div>

          <table class="details-table">
            <tr><td>Institutional Affiliation</td><td>${affiliationHtml(affiliation)}</td></tr>
            <tr>
              <td>Delegate Category</td>
              <td>${categoryLabel}</td>
            </tr>
            <tr>
              <td>Tariff Tier</td>
              <td>${(tier || 'early').toUpperCase()} RATE</td>
            </tr>
            <tr>
              <td>A workshop of Network Pharmacology</td>
              <td>${workshop ? 'Included (+₹600)' : 'Not Included'}</td>
            </tr>
            <tr>
              <td>Amount Remitted (Incl. 18% GST)</td>
              <td>${currency === 'USD' ? '$' : '₹ '}${Number(amount).toLocaleString()} ${currency}</td>
            </tr>
            <tr>
              <td>Transaction/Reference ID</td>
              <td style="font-family: monospace; color: #16a34a;">${payment_ref || 'Submitted on Portal'}</td>
            </tr>
            <tr>
              <td>Payment Proof Status</td>
              <td style="color: #16a34a;">Screenshot Attached &amp; Reconciled</td>
            </tr>
            <tr>
              <td>Conference Dates</td>
              <td>19th – 20th February 2027; workshop: 21 February 2027</td>
            </tr>
            <tr>
              <td>Venue</td>
              <td>NIPER-Raebareli Lucknow Campus, Bijnor Road, Lucknow 226002</td>
            </tr>
          </table>

          <p style="font-size: 13px; color: #475569; line-height: 1.5;">
            Please present this Reference ID (<strong>${ref_id}</strong>) at the Secretariat Registration Counter upon arrival to collect your delegate badge, scientific proceedings, and conference kit.
          </p>
        </div>
        <div class="footer">
          NIPER-Raebareli Lucknow Campus · In Collaboration with Indian Pharmacological Society
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
NeuroMet Pharmacon-2027 - Delegate Registration Confirmation
Reference ID: ${ref_id}

Dear ${full_name},

Your registration for NeuroMet Pharmacon-2027 is confirmed.
- Affiliation: ${affiliation || 'Not supplied'}
- Category: ${categoryLabel}
- Tier: ${(tier || 'early').toUpperCase()} RATE
- A workshop of Network Pharmacology: ${workshop ? 'Included (+₹600)' : 'Not Included'}
- Total Amount Remitted (Incl. 18% GST): ${currency === 'USD' ? '$' : '₹ '}${amount} ${currency}
- Dates: 19th – 20th February 2027; workshop: 21 February 2027
- Venue: NIPER-Raebareli Lucknow Campus, Bijnor Road, Sarojini Nagar, Lucknow 226002

Please present your Reference ID (${ref_id}) at registration desk for badge collection.
  `.trim();

  return await sendMail(db, {
    to: email,
    subject,
    html,
    text,
    type: 'DELEGATE_CONFIRMATION',
    refId: ref_id
  });
}

/**
 * EMAIL 2: Registration notification sent to the conference Gmail address
 */
async function sendOrganizerNotification(db, registration) {
  const config = getSmtpConfig();
  const organizerEmail = config.organizerEmail;
  const { full_name, email, phone, affiliation, category, tier, workshop, amount, currency, ref_id, payment_ref, has_proof } = registration;
  const categoryLabel = formatCategoryName(category);
  const subject = `[New Registration] ${full_name} (${categoryLabel}) [Ref: ${ref_id}]`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 16px; }
        .card { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
        .banner { background: #060e18; color: #ffffff; padding: 18px; border-left: 5px solid #cba234; }
        .banner h3 { margin: 0 0 4px; font-size: 16px; color: #ffffff; }
        .body { padding: 20px; }
        .item-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; }
        .item-label { color: #64748b; font-weight: 500; }
        .item-val { color: #0f172a; font-weight: 600; text-align: right; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="banner">
          <h3>⚡ New Delegate Registration Received</h3>
          <p style="margin: 0; font-size: 12px; color: #cba234;">NeuroMet Pharmacon-2027 · Notification</p>
        </div>
        <div class="body">
          <div class="item-row">
            <span class="item-label">Reference ID:</span>
            <span class="item-val" style="font-family: monospace; color: #16a34a;">${ref_id}</span>
          </div>
          <div class="item-row">
            <span class="item-label">Delegate Name:</span>
            <span class="item-val">${full_name}</span>
          </div>
          <div class="item-row"><span class="item-label">Affiliation:</span><span class="item-val">${affiliationHtml(affiliation)}</span></div>
          <div class="item-row">
            <span class="item-label">Email Address:</span>
            <span class="item-val">${email}</span>
          </div>
          <div class="item-row">
            <span class="item-label">Phone:</span>
            <span class="item-val">${phone || 'N/A'}</span>
          </div>
          <div class="item-row">
            <span class="item-label">Category:</span>
            <span class="item-val">${categoryLabel}</span>
          </div>
          <div class="item-row">
            <span class="item-label">Tier:</span>
            <span class="item-val">${(tier || 'early').toUpperCase()} RATE</span>
          </div>
          <div class="item-row">
            <span class="item-label">A workshop of Network Pharmacology:</span>
            <span class="item-val">${workshop ? 'Included (+₹600)' : 'No'}</span>
          </div>
          <div class="item-row">
            <span class="item-label">Fee Amount (Incl. 18% GST):</span>
            <span class="item-val" style="color: #0f172a;">${currency === 'USD' ? '$' : '₹'} ${Number(amount).toLocaleString()} ${currency}</span>
          </div>
          <div class="item-row">
            <span class="item-label">Transaction/Reference ID:</span>
            <span class="item-val" style="font-family: monospace; color: #15803d; font-weight: 700;">${payment_ref || 'Provided'}</span>
          </div>
          <div class="item-row">
            <span class="item-label">Payment Screenshot:</span>
            <span class="item-val" style="color: #0284c7;">${has_proof ? '✓ Attached (Stored in SQLite Database)' : 'Not Attached'}</span>
          </div>
          <p style="margin: 18px 0 0; font-size: 12px; color: #64748b;">
            Logged automatically in conference database. View full roster and payment proof in the Secretariat Admin Portal.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
New Delegate Registration - NeuroMet Pharmacon-2027
Ref ID: ${ref_id}
Name: ${full_name}
Affiliation: ${affiliation || 'Not supplied'}
Email: ${email}
Phone: ${phone || 'N/A'}
Category: ${categoryLabel}
Tier: ${(tier || 'early').toUpperCase()} RATE
Workshop: ${workshop ? 'Yes' : 'No'}
Amount: ${currency === 'USD' ? '$' : '₹'} ${amount} ${currency}
Transaction/Reference ID: ${payment_ref || 'N/A'}
Payment Screenshot: ${has_proof ? 'Attached in Database' : 'None'}
  `.trim();

  return await sendMail(db, {
    to: organizerEmail,
    subject,
    html,
    text,
    type: 'ORGANIZER_NOTIFICATION',
    refId: ref_id
  });
}

/**
 * Helper to dispatch both automatic registration emails in parallel
 */
async function handleRegistrationEmails(db, registration) {
  const [delegateResult, organizerResult] = await Promise.allSettled([
    sendDelegateConfirmation(db, registration),
    sendOrganizerNotification(db, registration)
  ]);

  return {
    delegate: delegateResult.status === 'fulfilled' ? delegateResult.value : { status: 'failed', error: delegateResult.reason?.message },
    organizer: organizerResult.status === 'fulfilled' ? organizerResult.value : { status: 'failed', error: organizerResult.reason?.message }
  };
}

function submissionReceiptHtml(kind, submission, admin = false) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const abstract = kind === 'ABSTRACT';
  const heading = abstract ? 'Abstract Submission Receipt' : 'Sponsorship Acknowledgement';
  const status = abstract ? 'Received · Pending scientific review' : submission.payment_ref ? 'Proof received · Pending bank verification' : 'Inquiry received · Payment not submitted';
  const fields = abstract
    ? [['Presenting author',submission.full_name],['Email',submission.email],['Abstract title',submission.title],['Scientific track',submission.category],['Presentation preference',submission.preference]]
    : [['Company',submission.company_name],['Contact person',submission.contact_person],['Email',submission.email],['Sponsorship tier',submission.tier],[submission.tier === 'Philanthropic' ? 'Contribution' : 'Total including 18% GST',['Custom','Philanthropic'].includes(submission.tier) ? 'Pending agreed quotation' : 'INR ' + Number(submission.amount).toLocaleString('en-IN')],['Transaction reference',submission.payment_ref || 'Not provided'],['Notes',submission.notes || '—'],...(submission.tier === 'Philanthropic' ? [['Support terms','One lunch and one dinner for one supporter; no commercial deliverables. Delegate registration is separate.']] : [])];
  const rows = fields.map(([label,value]) => `<tr><td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#64748b;width:35%;vertical-align:top;">${escape(label)}</td><td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#0f172a;overflow-wrap:anywhere;">${escape(value)}</td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;"><tr><td style="background:#060e18;border-bottom:4px solid #cba234;padding:28px;color:#fff;"><p style="color:#e2c477;font-size:12px;letter-spacing:2px;margin:0 0 12px;">OFFICIAL SUBMISSION RECEIPT</p><h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 10px;">NeuroMet Pharmacon-2027</h1><p style="font-size:13px;margin:0;color:#cbd5e1;">NIPER Raebareli &amp; Indian Pharmacological Society</p></td></tr><tr><td style="padding:28px;"><h2 style="font-family:Georgia,serif;font-size:22px;">${heading}</h2><p>${admin ? 'A new submission is ready for Secretariat review. Uploaded files are attached to this email.' : 'Thank you. Your submission has been recorded. Please keep this receipt for your records.'}</p><div style="background:#f8fafc;border:1px solid #cbd5e1;padding:18px;margin:20px 0;"><div style="font-size:12px;color:#64748b;">REFERENCE ID</div><strong style="font-size:21px;">${escape(submission.ref_id)}</strong><p style="font-size:13px;color:#334155;margin-bottom:0;">${status}</p></div><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">${rows}</table><p style="font-size:13px;line-height:1.6;color:#64748b;margin-top:24px;">This receipt acknowledges submission only. It does not confirm scientific acceptance or bank settlement. Quote your reference ID when contacting the Secretariat.</p></td></tr><tr><td style="padding:18px;background:#f8fafc;font-size:12px;color:#64748b;text-align:center;">19–20 February 2027 · Post-conference workshop: 21 February 2027 · NIPER Raebareli, Lucknow Campus</td></tr></table></td></tr></table></body></html>`;
}

async function sendSubmissionEmails(db, kind, submission, attachments = []) {
  const organizer = getSmtpConfig().organizerEmail;
  const details = kind === 'ABSTRACT'
    ? `Title: ${submission.title}\nTrack: ${submission.category}\nPresentation: ${submission.preference}\nAuthor: ${submission.full_name}`
    : `Company: ${submission.company_name}\nContact: ${submission.contact_person}\nTier: ${submission.tier}\nAmount: ${['Custom','Philanthropic'].includes(submission.tier) ? 'Pending agreement with Secretariat' : 'INR ' + submission.amount + ' (including GST)'}\nTransaction reference: ${submission.payment_ref || 'Not provided (inquiry only)'}\nPayment status: ${submission.payment_ref ? 'Proof received; pending bank verification' : 'Unpaid inquiry'}\nNotes: ${submission.notes || ''}${submission.tier === 'Philanthropic' ? '\nSupport terms: One lunch and one dinner for one supporter; no commercial deliverables. Delegate registration is separate.' : ''}`;
  const text = `NeuroMet Pharmacon-2027\nReference: ${submission.ref_id}\n${details}\nEmail: ${submission.email}\nYour submission has been received for Secretariat review. This is an acknowledgement, not acceptance or payment verification.`;
  const results = await Promise.allSettled([
    sendMail(db,{to:submission.email,subject:`${kind === 'ABSTRACT' ? 'Abstract submission' : 'Sponsorship'} acknowledgement [${submission.ref_id}]`,text,html:submissionReceiptHtml(kind,submission),type:`${kind}_CONFIRMATION`,refId:submission.ref_id}),
    sendMail(db,{to:organizer,subject:`New ${kind.toLowerCase()} submission [${submission.ref_id}]`,text,html:submissionReceiptHtml(kind,submission,true),type:`${kind}_ORGANIZER_NOTIFICATION`,refId:submission.ref_id,attachments})
  ]);
  return Object.fromEntries(['delegate','organizer'].map((recipient,index)=>[recipient,results[index].status === 'fulfilled' ? results[index].value.status : 'failed']));
}

module.exports = {
  generateRefId,
  getSmtpConfig,
  getTransporter,
  sendMail,
  sendSubmissionEmails,
  sendDelegateConfirmation,
  sendOrganizerNotification,
  handleRegistrationEmails
};
