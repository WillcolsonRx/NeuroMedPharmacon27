# Activate NMP27-A1 registration numbering

This changes **new R2 registrations** to `NMP27-A1`, `NMP27-A2`, etc. The internal
browser submission UUID still makes network retries idempotent. Existing registrations
keep their issued references; do not reset records, email delivery states or payment
proofs. No new accounts, secrets, buckets or paid services are needed.

## 1. Update Supabase's import validation

In the production Supabase dashboard, open **SQL Editor → New query**. Paste the
complete contents of `supabase/migrations/20261112_sequential_registration_numbers.sql`
and run it. This repeatable update lets the existing import function accept both
A-number IDs and the original UUID format. It retains the existing unique constraint,
idempotency checks and service-role permissions. It does not change any existing row
or send email. Apply it after the original R2 intake migration.

## 2. Wait for the updated Vercel deployment

Confirm the latest GitHub deployment is **Ready** in Vercel before deploying the
Worker. The server now accepts and verifies a returned A-number against the original
submission UUID; older Worker responses remain supported during this rollout. No
Vercel environment variable changes are required.

## 3. Deploy the updated Cloudflare Worker

From the existing local repository in PowerShell or a terminal:

```text
git pull origin main
cd cloudflare/registration-intake
npx wrangler deploy
```

Deploy the whole module project, including `registration-numbers.mjs`; pasting only
`worker.mjs` into the dashboard editor omits its imported allocator. Use the existing
Cloudflare account, queue, bucket, secrets and callback endpoint. The configuration
keeps `CALLBACK_URL` pointed at the full `/api/internal/r2-registration` endpoint.
Do not recreate the bucket or reset `registration-numbers/counter.json`.

## 4. Verify with the next legitimate registration

Reload the conference page. The first new registration after Worker activation gets
`NMP27-A1`; later registrations increment the number. Check the receipt/PDF, recovery
record, Supabase row and both emails show the same ID. Retry of the same internal
submission must return that number, not allocate a second registration. Check the
abstract-registration form verifies that ID with the original registration email
once the roster import is complete. Existing long IDs remain accepted.

Do not ask already-registered delegates to submit or pay again. Already-sent email
messages are not rewritten by deployment. Existing failed mail remains recoverable
through the same reviewed retry procedure; do not reset `sent` or `needs_review`
states merely to test numbering.

The counter starts at 1 when it does not yet exist. Conditional writes serialize
concurrent allocations. Reservations interrupted by failures are completed by later
requests; gaps are possible and never filled by reusing a number. On extreme
contention or R2 failure, intake refuses to confirm receipt and the same browser
submission can be retried safely. Keep the counter, mapping and record objects
private and backed up together. Future deployments preserve the counter automatically.
