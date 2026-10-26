# Vercel Deployment Guide — NeuroMedPharmacon 2027

This application is configured for deployment on [Vercel](https://vercel.com).

---

## 🚀 Quick Deployment Options

### Option 1: Deploy via GitHub / GitLab / Bitbucket (Recommended)
1. Push this repository to your GitHub account:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for NeuroMedPharmacon 2027"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. Go to [vercel.com/new](https://vercel.com/new).
3. Import your repository.
4. **Project Settings**:
   - **Framework Preset**: `Other` (or leave as auto-detected)
   - **Root Directory**: `./` (default)
   - **Build Command**: `npm run build`
   - **Output Directory**: (leave empty or default)
5. Under **Environment Variables**, add the recommended environment variables (see table below).
6. Click **Deploy**.

---

### Option 2: Deploy via Vercel CLI
If you have `vercel` CLI installed:
```bash
# Log in to Vercel
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

---

## ⚙️ Environment Variables (Vercel Project Settings)

Add the following environment variables in the **Vercel Dashboard** under **Project Settings → Environment Variables**:

| Variable | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `ADMIN_TOKEN` | Secret key for Secretariat Admin Console (`/admin.html`) | `your-secure-secret-token` |
| `ORGANIZER_EMAIL` | Secretariat recipient email for delegate submissions | `neuromedpharmacon26@gmail.com` |
| `SMTP_HOST` | Outgoing SMTP mail server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_SECURE` | Use SSL/TLS | `false` |
| `SMTP_USER` | Conference Gmail address | `neuromedpharmacon26@gmail.com` |
| `SMTP_PASS` | 16-character Google App Password | `xxxx xxxx xxxx xxxx` |

> **Note on Gmail SMTP**: To generate an App Password in Gmail, navigate to Google Account → Security → 2-Step Verification → App passwords. Generate a password for "Mail" and paste the 16-character code into `SMTP_PASS`.

---

## 📁 How Vercel Serves the Application

- **Static Pages & Assets (`/`, `/admin.html`, `/downloads/*`, `/assets/*`)**:
  Served directly from Vercel's global Edge CDN with zero latency and instant caching.
- **Serverless API Routes (`/api/*`)**:
  Handled via `api/index.js` configured with `vercel.json` rewrites.
- **Database & Storage on Vercel Serverless**:
  The SQLite database and uploads dynamically adapt to Vercel's serverless environment using `/tmp/` with automatic in-memory fallback.

## Registration email and receipt checks

Registration now waits for both email attempts before returning, so Vercel does
not suspend background delivery after the response. A saved registration remains
successful if email delivery fails; the receipt reports incomplete confirmation
and offers a PDF download. Do not resubmit a registration just to retry mail.

In Vercel Project Settings → Environment Variables, configure `SMTP_HOST`,
`SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `ORGANIZER_EMAIL` for the
Production environment, then redeploy. For Gmail use `smtp.gmail.com`, port `587`,
`SMTP_SECURE=false`, and a Google App Password for `SMTP_PASS` (not the normal
account password). Enter secrets only in the hosting provider's secure settings.
Set a private `ADMIN_TOKEN` as well. SMTP connections validate TLS certificates.

After deploying, use an authorized test registration to check both recipient
inboxes and spam folders. The `/api/register` response includes separate
`email_status.delegate` and `email_status.organizer` results. `sent` means SMTP
accepted the message, not that it reached the inbox. `not_configured` means sender
credentials are missing; `failed` requires inspection of hosting function logs or
the authenticated mail-log endpoint. Do not share SMTP passwords or admin tokens
in screenshots or logs. Automated tests simulate or mock SMTP; they do not prove
production delivery.

The build bundles jsPDF at `/assets/jspdf.umd.min.js`. The receipt's Download
Receipt PDF button saves a PDF directly rather than opening the browser print
dialog. Verify the downloaded file contains the correct registration ID, delegate,
transaction reference, and amount.

## Permanent storage with Supabase (required on Vercel)

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
   This installs server-only tables and a private `payment-proofs` bucket.
2. In Vercel Production environment variables, set `SUPABASE_URL` to the project
   URL and `SUPABASE_SERVICE_ROLE_KEY` to its service-role key. Never use a public
   anon key here, commit the key, or put it in browser code. Use a separate project
   for preview/test deployments.
3. Set a strong private `ADMIN_TOKEN` and the SMTP variables above, then redeploy.
4. Check `/api/health`: `storage` must be `supabase` and `submissionsEnabled` true.
   This reports configuration selection, not database connectivity. An authorized
   test registration must also succeed, appear in Supabase and the admin console,
   and retain its private proof after another deployment. Verify both mailboxes.

On Vercel, POST submissions return 503 until permanent storage is configured;
this prevents silently accepting registrations into disposable `/tmp` storage.
Local development continues to use SQLite via `DATABASE_PATH`. Existing bundled
SQLite records and uploads are not automatically migrated or published into
Supabase; preserve/export genuine previous submissions before a migration.
Admin proof links are signed for five minutes; refresh the dashboard to renew.
The website checks image/PDF headers, not whether a bank transfer actually settled.
The Secretariat must reconcile submitted references against bank records.

Early-bird rates run through 9 November 2026, regular rates through 15 December
2026 (inclusive, Asia/Kolkata), and spot rates apply afterward.

## Word abstracts and sponsorship confirmations

For an existing Supabase project, run
`supabase/migrations/20261023_abstract_documents.sql` in the SQL Editor before
redeploying this update. It adds document metadata and a private
`abstract-documents` bucket. New projects can run the complete `supabase/schema.sql`.
No additional credentials are needed.

Abstract submissions require a Word `.doc` or `.docx` file (maximum 1 MB) instead
of a text body. File headers/container contents are checked; this is not malware
scanning. The Secretariat should review attachments in protected mode. The file
is stored privately and attached only to organizer acknowledgement
emails. Admins can download it from the Abstracts table using short-lived signed
links. Existing text-only abstracts remain available as legacy records; they
cannot be converted into the original Word files automatically.

Sponsorship requests now send acknowledgements to the sponsor and organizer.
Standard tier totals, including 18% GST, are calculated on the server; client
amounts are ignored. Payment is optional for inquiries, but a submitted payment
requires both a transaction reference and a valid PNG/JPEG/WebP/PDF proof. Proofs
are stored privately, attached only to organizer acknowledgement emails and linked in the admin
Sponsorships table. Receipt of a proof does not verify bank settlement. Custom
sponsorships show a zero provisional total pending an agreed quotation.

Both flows wait for both mail attempts and report separate recipient statuses.
A mail failure does not undo a saved submission; do not resubmit to retry mail.
Live SMTP delivery still requires checking real inboxes and function mail logs.

## Secured Secretariat and abstract decision campaigns

The shared-token production dashboard has been replaced by `/secretariat`, using
approved Supabase Auth accounts and MFA. Follow `SECRETARIAT_SETUP.md` for the
migration, staff approvals, required APP_URL, SMTP queue configuration and Supabase
Cron schedule. The queue starts paused. There is no paid upgrade or account creation
automated by this repository. Public submissions continue using existing SMTP.

## Delegate affiliation and inclusive registration fees

Before deploying this update to an existing project, run
`supabase/migrations/20261026_registration_affiliation.sql` in the Supabase SQL Editor.
New projects have the affiliation column in the base schema. This preserves all old
registrations and amounts; no historical payments are recalculated.

Delegates enter their name, affiliation, email and phone before choosing a category.
Standard delegate prices already include GST: no additional percentage is added.
The optional workshop adds only its listed INR 600. Sponsorship pricing is unchanged.

The fourth category, In-house students (INR 2,000 in every registration tier), is
shown only when the entered affiliation matches NIPER-Raebareli aliases, including
NIPER-R, NIPER Raebareli and the full institutional name. Changing to a different
affiliation removes the option and resets an in-house selection to the standard
student category. The server independently checks affiliation, allowed categories
and payable amounts; it ignores client-provided totals. Affiliation is recorded
and included in receipts, registration email and staff records.

This is self-declared affiliation, not identity verification. Secretariat staff must
verify in-house student status before confirming eligibility. Hiding a dropdown
option does not make a fee secret or establish student identity.
