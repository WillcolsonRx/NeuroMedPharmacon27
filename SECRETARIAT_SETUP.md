# Secretariat review and decision email setup

The code is ready to configure; it does not create provider accounts, change billing,
run production SQL, or send real messages by itself. Keep the queue paused until the
checks below pass. Existing registration and submission confirmations keep using
SMTP. Abstract decision emails use the durable queue, with an immediate attempt on finalization.

## Zero-additional-cost configuration

- Keep the current Vercel deployment and Supabase project, provided the plans and
  usage limits are suitable. No paid resources or automatic upgrades are enabled.
- Use the existing Gmail SMTP credentials for decision mail: `MAIL_PROVIDER=smtp`.
  A new domain or email account is not required. Gmail quotas also include the
  website's registration/abstract/sponsorship acknowledgements and all other mail
  sent by that account. The decision queue is capped at 90 attempts per UTC day;
  it cannot discover the account's remaining Gmail quota.
- Supabase Cron + pg_net calls the worker every 15 minutes. This avoids relying
  on a browser or a frequent paid Vercel cron schedule. A paused/unavailable
  Supabase project, exhausted quota or disabled cron stops delivery; jobs persist.
- Optional: `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM` and a domain you
  already own and can verify. A Resend test sender cannot mail arbitrary delegates.
  There is no need to purchase a domain merely to use this feature.

Current free-plan terms could not be fetched from this workspace. Before launch,
check https://supabase.com/pricing, https://resend.com/pricing (if used), and
https://vercel.com/docs/plans/hobby. In particular, check Hobby eligibility for the
conference's sponsorship/payment activity. This code does not establish eligibility.
No free provider guarantees delivery or uptime. There are no automatic paid upgrades.

## 1. Database migration

In the existing Supabase SQL Editor, run
`supabase/migrations/20261023_secretariat.sql`, then
`supabase/migrations/20261102_secretariat_decisions.sql`. For an existing Secretariat
installation, only the latter update is new. Apply it **before deploying this update**.
Run the existing base schema and
Word-document migration first if preparing a new project. This migration is
repeatable and preserves submissions. It installs staff membership, review
metadata, an audit log, a mail queue, delivery events and rate limits. Only the
server service-role can execute the workflow functions; browser roles cannot.

## 2. Approved accounts and MFA

In Supabase Authentication, disable public signups. Create a confirmed account for
each authorized team member using the dashboard. Use individual strong passwords
and share initial credentials privately. Record their Authentication user UUIDs,
then approve each one in the SQL Editor:

```sql
insert into public.secretariat_members(user_id)
values ('REPLACE-WITH-AUTH-USER-UUID')
on conflict(user_id) do update set active=true;
```

To remove access, set `active=false`. Each protected request checks this table and
Supabase's user endpoint. Users enroll a TOTP authenticator during first login.
Keep at least two approved staff accounts; an administrator with Supabase dashboard
access can manage a lost factor using the Authentication tools. There is no public
self-signup, browser-stored token, shared admin password, or token in a production
admin URL. The HttpOnly/Secure/SameSite session lasts at most one hour; sign in again
when it expires. `ADMIN_TOKEN` works only in local non-production development.

The workspace is `/secretariat`, separate from the public conference page. The old
`/admin.html` redirects there and production shared-token API calls return 410.
A separate custom subdomain is optional, requires ownership/DNS configuration and
does not add authentication security by itself. No domain has been purchased.

## 3. Vercel environment variables

Keep `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the current SMTP variables.
Add/update Production variables, then redeploy:

| Name | Value |
| --- | --- |
| `APP_URL` | `https://neuro-med-pharmacon-27.vercel.app` (exact production origin) |
| `MAIL_PROVIDER` | `smtp` |
| `MAIL_WORKER_SECRET` | New random secret of at least 32 characters |
| `MAIL_REPLY_TO` | Optional Secretariat contact email |
| `MAIL_FROM` | Optional for SMTP; defaults to SMTP_USER. Required verified sender for Resend. |

Enter secret values only in secure provider settings. Never paste them into chat,
SQL committed to Git, browser code or screenshots. Use separate projects and
credentials for preview deployments; writes require APP_URL to match the origin.
The Vercel worker has a 120-second maximum and claims at most three jobs per run.

## 4. Scheduler

In Supabase Vault, create two secrets:

- `nmp_worker_url`: `https://neuro-med-pharmacon-27.vercel.app/api/internal/mail-worker`
- `nmp_worker_secret`: exactly the same private value as Vercel `MAIL_WORKER_SECRET`.

Then run `supabase/schedule-mail.sql` in the SQL Editor. It installs/uses pg_cron
and pg_net and upserts a named job every 15 minutes. This provider-specific
scheduler must be verified in the real Supabase project; the embedded SQL tests
do not emulate those extensions. Inspect `cron.job_run_details` and
`net._http_response` for successful HTTP results. A successful cron invocation
alone does not prove an email was delivered. If either extension is unavailable,
keep delivery paused and resolve that prerequisite instead of relying on live
server processes or browser timers.

## 5. Review and mail workflow

1. Sign in at `/secretariat`, verify your authenticator and open Abstract review.
2. On first setup, verify SMTP/provider settings with a staff test using the advanced
   batch tools below. Then explicitly enable decision email delivery using the banner
   or Resume delivery in the queue. The migration preserves the current pause setting;
   enabling delivery also resumes any existing queued messages.
3. Open a private Word abstract. Choose **Accept · Oral**, **Accept · Poster**,
   **Request revision** or **Reject**. This is the team's decision, independent of
   the delegate's requested presentation type. Expand Ready message snippet to read
   the prepared letter. Add optional presenter instructions when needed.
4. **Save notes only** saves private notes without changing the decision or sending
   mail. Notes and presentation choices remain drafts in this tab until finalized;
   refreshing the browser loses unsaved drafts. Internal notes never enter the email.
5. Click **Preview & finalize** to read the personalized letter and recipient. Then
   **Finalize decision & send email** atomically saves the decision and one durable
   notification before attempting that specific message immediately in the request.
   The preview alone sends nothing. Repeat/lost-response requests reuse the same
   decision-version job. Concurrent changes require reloading the review.
6. Check the resulting per-abstract delivery badge and Decision email queue. “Sent”
   means provider/SMTP acceptance, not proven inbox delivery. Pauses, daily allowance
   exhaustion, configuration problems and temporary failures retain the job; they
   never silently discard the decision or report it as sent. The scheduled worker
   retries eligible jobs, so keep the scheduler configured even with immediate sends.
7. For uncertain SMTP outcomes, inspect provider logs/the sender's mailbox before
   **Reconcile with provider logs**. Record whether it was definitely sent; a resend
   requires confirmation and evidence. Resolve outstanding/uncertain notifications
   before changing a decision. Sent decisions may be deliberately corrected with a
   new decision/version; the earlier email cannot be recalled.

The advanced batch tools remain available for already-reviewed legacy records:
filter/select reviewed abstracts (25/page, at most 500), add shared instructions,
preview, queue a test to the signed-in staff member, check its actual inbox, then
confirm the batch. Batch jobs use the scheduler rather than an immediate attempt.
The 90-attempt UTC daily cap applies jointly to immediate sends and scheduled jobs;
100 decisions may therefore span two days. Other Gmail mail consumes provider quota
outside this application cap. No provider limit is bypassed.

## Dashboard responsiveness

Record pages no longer sign every attachment before rendering. Private download
links are created on demand through an authenticated endpoint when a file is opened;
legacy inline payment proofs are omitted from list payloads. Submission totals load
separately, and recent tab/page responses are cached in memory for 15 seconds, up to
20 pages. Refresh explicitly fetches current data; writes clear this cache. Rapid tab
changes cancel/ignore outdated requests, and unsaved row drafts survive tab switches.
Authentication and staff membership remain checked on every server request, without
an authentication cache. Indexes support date-ordered pages. Free-tier cold starts,
Supabase availability and network/provider latency can still affect response times.

Acceptance letters distinguish presentation acceptance from verified registration
and payment. Neither uploads nor acknowledgements prove a bank transfer settled.
There are no attachments in decision emails. Admin-only attachments on submission
acknowledgements remain unchanged.

## Delivery tracking

For SMTP, “sent” means the server accepted the message. Inbox placement and bounces
must be checked in the sender's mailbox/provider logs. Unknown SMTP outcomes are
not automatically replayed because SMTP has no provider idempotency key.

For optional Resend, configure a webhook to
`https://neuro-med-pharmacon-27.vercel.app/api/internal/mail-events`, subscribe to
`email.delivered`, `email.bounced`, `email.complained`, and put its signing secret
in Vercel `RESEND_WEBHOOK_SECRET`. Signed events record delivery/bounces and suppress
future decision campaigns to bounced/complaining recipients. No webhook secret or
key is necessary for the default SMTP option. Resend retries use a stable
idempotency key within a conservative 23-hour window; interrupted/stale attempts
are flagged for review, never silently replayed beyond that window.

## Storage, backups and launch checks

The workspace shows the size of uploaded files and total submissions. Compare it
with Supabase's actual Usage page, including database size and bandwidth. At the
1 MB maximum, 500 Word files alone approach 500 MB; payment proofs consume additional
space. Encourage small Word files and compressed proof images. The integration
cannot promise 500 maximum-size submissions will fit a particular free plan.
Do not delete live conference files to free space without an approved archive.

Before launch, export a secure backup of real submissions and set a regular backup
routine; free-plan backups and recovery must be checked, not assumed. An acceptance
campaign is not a backup. Test a registration, a Word abstract and a sponsorship,
then confirm private downloads, both submission mailboxes, staff MFA, a queued test
letter, scheduler execution and a small approved campaign. No real recipients were
emailed during development. Embedded PostgreSQL tests verify the application SQL,
not production secrets, provider quotas, Cron availability or inbox delivery.

## Staff password recovery

In Supabase Authentication > URL Configuration, set Site URL to the deployed site
origin (`https://neuro-med-pharmacon-27.vercel.app`) rather than localhost. Add the
exact URL `https://neuro-med-pharmacon-27.vercel.app/secretariat/reset` to Redirect
URLs. Vercel APP_URL must still be the production origin. Redeploy the updated code,
then use **Forgot password?** on `/secretariat` to request a new email. Open only
the newest link; expired/used links cannot be repaired by editing their URL.

Supabase Auth sends recovery emails using its own mail configuration, not this
app's Nodemailer SMTP variables. If its default sender is rate-limited, wait for
the quota window or configure Authentication's custom SMTP with your authorized
mail account. Do not repeatedly request new emails. Keep the standard recovery
email template's ConfirmationURL link so the requested redirect is preserved.

The reset page removes tokens from the address bar and exchanges them into a
secure HttpOnly cookie. It verifies the approved account with Supabase before any
password update. Existing verified MFA factors still require an authenticator
code. Successful password changes clear the browser session and request global
sign-out; return to staff login with the new password. Membership and MFA factors
are not deleted. There is no new database migration for this recovery update.
