# Primary registration receiver: architecture and activation

This implements **registration intake only**. Abstracts and sponsorships retain their existing paths. It is inactive until `R2_INTAKE_URL` and `R2_INTAKE_TOKEN` are configured on Vercel. No Cloudflare account resources or live database changes are created by committing these files.

## Evaluation and final design

A private Cloudflare R2 bucket stores one immutable JSON record per registration, including the original <=200 KB proof as base64. A single object avoids acknowledging a metadata record whose proof was not stored. Records have no automatic expiry. They are not public website assets. Use Standard storage; do not enable public bucket access or automatic deletion.

Vercel validates the form and calculates the fee without contacting Supabase, then sends the record to the authenticated Worker. The Worker returns an acknowledgement only after R2 confirms the record and its processing state. The browser keeps a random submission UUID in session storage across unsuccessful attempts. Identical retries return the original ID and tariff snapshot; changed data under an existing ID is rejected without overwriting it. Receipt IDs remain compatible with the abstract verifier. Abstract verification becomes available after Supabase import.

A Cloudflare Queue consumer then attempts, in order:
1. Deterministic proof upload and idempotent registration insertion in Supabase.
2. Secretariat email, with the actual proof attached.
3. Delegate confirmation (without the proof).

Each recipient is tracked separately. **A Supabase failure does not prevent either email attempt.** The R2 path does not write SMTP logs through Supabase; its delivery outcomes are persisted in R2, so database latency cannot hold up email acknowledgement. Legacy submission email logs remain unchanged. Processing outcomes are recorded in R2 rather than depending on Supabase. R2 is the original intake, Supabase is the operational copy, and the Secretariat email is an additional human-readable copy, not a full database backup. Gmail SMTP is retained; this does not remove its sending limits or guarantee inbox delivery.

Queue records contain only the registration ID. Free Queues expire after 24 hours, so the independent scheduled scanner reads the non-expiring R2 pending index. Queue exhaustion, enqueue failure and expired messages do not delete intake records. The scanner rotates through two pending records every five minutes; this is a conservative free-Worker fallback, **not** a high-throughput substitute for the queue. A large prolonged outage can take hours to clear on this fallback alone. Watch backlog counts and validate the actual Worker CPU/subrequest usage before announcing registration.

Conditional R2 ETag writes lease each job and prevent concurrent workers claiming the same processing state. Leases expire after three minutes, longer than the bounded callbacks. Definite temporary SMTP rejection is retried. A timeout after an email might have been accepted is held as `needs_review`, never blindly resent. If a worker dies while a recipient is marked `sending`, the next claimant also holds that recipient for review. Failed and uncertain jobs stay recoverable.

Telegram sends a reference-only failure alert, without name, email or proof. Alerts are attempted when processing is incomplete and retried if notification fails; successful alerts are limited to one per registration per day. This requires an operator-monitored private Telegram destination. An outage of both the Worker and Telegram cannot alert itself; external uptime checks remain advisable. An SMTP success is labelled `sent` (accepted by the sending server), not confirmed inbox delivery. Bounce/webhook delivery tracking is not supplied by Gmail SMTP in this implementation.

## Resources and credentials

Use the conference owner's Cloudflare account, enable R2 billing, and review current free allowances/overage rules. This is not a contractual zero-cost cap. Confirm Workers/Queues Free is selected. Do not upgrade the plan accidentally. Review [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), and [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/).

Create, through the Cloudflare dashboard or authenticated Wrangler:
- Private Standard R2 bucket `neuromet-registration-intake`.
- Queue `neuromet-registration-processing`.
- Worker from `cloudflare/registration-intake/wrangler.jsonc`.

If using Wrangler, install a current version locally or use `npx wrangler` after Cloudflare authentication. From `cloudflare/registration-intake/`:

```
npx wrangler r2 bucket create neuromet-registration-intake
npx wrangler queues create neuromet-registration-processing
```

Replace `CALLBACK_URL` in `wrangler.jsonc` with the production HTTPS URL ending `/api/internal/r2-registration`. Use the production host directly; do not rely on redirects or a deployment-protected preview.

Generate **three different** random secrets of at least 32 characters in a password manager:

| Worker secret | Matching Vercel setting | Purpose |
| --- | --- | --- |
| `INTAKE_TOKEN` | `R2_INTAKE_TOKEN` | Vercel may write new intake records |
| `CALLBACK_TOKEN` | `R2_CALLBACK_TOKEN` | Worker may invoke the internal processing endpoint |
| `RECOVERY_TOKEN` | None | Secretariat-only recovery and reviewed retry access |
| `TELEGRAM_BOT_TOKEN` | None | Bot credential |
| `TELEGRAM_CHAT_ID` | None | Private Secretariat chat/channel destination |

Set Worker secrets using Cloudflare's encrypted secrets UI or interactive `npx wrangler secret put NAME`. Never place these in source, browser scripts, URLs, public screenshots or chat. The intake rejects submissions until callback, recovery and alert configuration is present. The Supabase service role key and SMTP credentials remain solely on Vercel. Configure `ORGANIZER_EMAIL=neuromedpharmacon26@gmail.com` there, and verify the existing SMTP settings.

## Safe activation order

1. Run `supabase/migrations/20261029_r2_registration_intake.sql` in the existing Supabase SQL Editor. This adds `input_hash` and a service-role-only idempotent import function; historical rows are retained. Ensure prior affiliation/abstract migrations are already applied.
2. Deploy this application version to Vercel **without** either `R2_INTAKE_URL` or `R2_INTAKE_TOKEN` yet. Set `R2_CALLBACK_TOKEN`, retain working Supabase and SMTP settings, then redeploy. Existing registration behaviour continues.
3. Create the Cloudflare bucket and queue; set the callback URL and all five Worker secrets; deploy with `npx wrangler deploy`. Confirm the queue consumer and five-minute cron are enabled. No custom domain transfer is necessary; the Worker can use its HTTPS `workers.dev` address.
4. In a dedicated staging environment, run the verification cases below. Production email/payment tests need explicit operator-approved test data. Do not deliberately disable production Supabase to simulate an outage.
5. Set `R2_INTAKE_URL=https://<your-worker>.workers.dev` and the matching `R2_INTAKE_TOKEN` on Vercel, then redeploy. This enables R2-first intake. R2 failure then fails closed: it **does not silently revert to Supabase-only storage**.
6. Submit one approved production test registration, inspect all three copies, the actual attached proof, recipient inboxes/spam, and the recovery status. Until this is done, do not claim the live pipeline is validated.

Do not turn the feature off while pending jobs remain without a recovery plan. Keep the internal callback and its token configured until the R2 backlog is resolved. Rotating intake credentials does not change submission IDs. An already-open browser can need a reload after a deployment. Session storage retains only the UUID, not payment proofs; closing the tab or changing browser loses that retry context.

## Secretariat recovery

Open `https://<your-worker>.workers.dev/recovery` and enter the separate recovery key. It is kept in page memory, not local storage or a query string. List records, inspect statuses and download the complete original JSON or payment proof. This also works while Supabase is down. Protect the recovery key as an administrative credential; anyone with it can read delegate details and request reviewed email retries. This is separate from the existing Supabase/TOTP dashboard so a database outage cannot lock out recovery. It does not provide per-person identity/MFA; for broader staff access, add Cloudflare Access and individual access policies before sharing it widely.

For `failed` or `needs_review` email results, inspect provider/Sent Mail logs first. Only after confirming no original message was sent, select the recipient, check the confirmation box and record evidence (at least 20 characters) to queue a retry. An append-only audit object is saved. This never creates another registration or asks the delegate to pay again. The original delegate email is immutable; correcting an address requires a separately reviewed feature, not editing the preserved evidence.

Rows initially marked `pending` may simply await processing. `sent` means SMTP accepted the message. Database import status remains separate. If credentials are wrong, fix them first. The recovery key can also be used with the documented Worker routes using an Authorization Bearer header; never use it in a URL.

## Verification and operating limits

Before activation, verify:
- Missing/wrong credentials cannot ingest, view records or invoke callbacks.
- R2 failure never shows a successful receipt.
- R2 success plus Supabase failure still retains proof and attempts Secretariat mail.
- A repeated identical request returns one ID and creates one Supabase row.
- Enqueue failure and expired messages remain recoverable through the scheduled scanner.
- Temporary SMTP failure retries; uncertain SMTP outcome requires review; Telegram failures retry without deleting the registration.
- The Secretariat email contains the correct original proof and amount; delegate email has no proof attachment.
- R2 credentials and private object URLs never appear in the frontend/receipt.

Use Worker metrics, queue backlog and the private recovery list. There is no automatic retention deletion, billing hard cap, independent external uptime monitor, or promise of unlimited/free availability. Operators must decide retention and delete records only under a reviewed retention policy. Do not expose the bucket publicly. Website hosting remains on Vercel: this design protects acknowledged intake from Supabase/SMTP failure but does not make Vercel or Cloudflare outages impossible. Actual staging load/CPU limits and provider credentials must be verified in the owner's accounts.
