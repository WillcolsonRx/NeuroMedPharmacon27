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
