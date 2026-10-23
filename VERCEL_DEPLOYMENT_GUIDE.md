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
