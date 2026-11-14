# Phase 3 — local setup and verification

Phase 3 adds persistent in-app reminders and private medical documents. No email/SMS sender, production deployment, hosted migration, bucket creation, or hosted policy change has been performed by this implementation.

## 1. Review and apply the app migration manually

Review `prisma/migrations/202611140002_reminders_documents/migration.sql` and confirm a backup/recovery point for the intended development database. The migration adds reminder enums/state/source fields and a unique `(vaccinationId, dueAt)` constraint, document size/state fields, and an RLS-protected `StorageObject` inventory table. It preserves completed legacy reminders and backfills inventory from existing document metadata. It does not drop existing tables/columns or alter Supabase's managed Storage schema.

With Node 24 selected, run from the project directory:

```bash
nvm use
npm ci
npm run db:deploy
npm run db:generate
```

These are manual commands. Confirm your `.env` targets the correct database. Do not use `migrate reset` or `db push` for this upgrade. Previous migration files are unchanged.

## 2. Configure the private bucket and RLS manually

In Supabase **Storage**, create a bucket named **pet-documents**:

- **Public bucket: OFF**.
- File size limit: **10485760 bytes** (10 MiB; the UI calls this 10 MB).
- Allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.

Review `docs/supabase-storage-policies.sql`, then apply it in the project's SQL Editor using the trusted DB administrator. It creates a narrowly scoped boolean ownership helper in `public` and authenticated SELECT/INSERT/DELETE Storage policies. It does not alter Storage table structures, insert/delete Storage metadata directly, or add an UPDATE policy. Storage file mutations only use the Storage SDK/API.

The helper is SECURITY DEFINER with an empty search path and fully qualified tables; execution is revoked from PUBLIC and granted only to authenticated. It is needed because the app's public tables deliberately have RLS and no client-facing data policies. The helper checks `auth.uid()` against the pet owner and the exact document path. INSERT requires an UPLOADING reservation; DELETE requires UPLOADING/DELETING. SELECT permits the owner to see reserved/deleting files as well, because Supabase removal requires SELECT in addition to DELETE. The app only signs READY documents.

Review existing bucket policies: permissive policies are OR-combined, so a broad existing policy could bypass these restrictions. The script deliberately does not drop/replace unrelated policies. Keep the bucket private and do not add public read or object-overwrite policies. The script can be rerun without duplicating its named policies.

## 3. Set server-only environment variables

Keep your working Phase 2 `.env` values. Add:

```dotenv
CRON_SECRET=<at-least-32-random-characters>
SUPABASE_SERVICE_ROLE_KEY=<your-project-service-role-key>
```

Generate the cron secret locally, for example:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the result into `.env`; do not commit it or put it in a URL. The service-role key is used **only by the server-side cleanup worker**, not by uploads, preview, or download requests. Never prefix either variable with `NEXT_PUBLIC_`. Normal file operations use the verified user's Supabase session and RLS. The bucket name is fixed to `pet-documents`; the legacy `SUPABASE_STORAGE_BUCKET=pet-documents` example setting is informational.

Without a configured CRON_SECRET, the scheduled route returns 503. With a missing/incorrect bearer header it returns 401. If the cleanup key is absent, reminders still process but the job reports `cleanup.skipped: true`; configure the key before relying on orphan cleanup.

## 4. Start and exercise the app

```bash
npm run dev
```

Open `http://localhost:3000` and sign in with an account you control.

1. **Reminders:** add a medication, vet-appointment, or other care task. Past dates appear under Overdue; today/future dates under Upcoming. Mark one Done and one Dismissed; reload and verify persistence.
2. **Automatic reminders:** create/edit a vaccination with a next due date. Its reminder is reconciled in the same database transaction. Changing the due date dismisses obsolete pending reminders and creates one for the new date. Removing the due date or deleting the vaccination dismisses pending reminders; completed/dismissed history remains. Returning to an already completed/dismissed vaccination/date does not reopen that reminder.
3. **Dashboard:** pending reminders appear in the care panel; the bell counts tasks due today or overdue, scoped to the signed-in owner. Dates use UTC calendar days. Refresh/navigation updates the indicator; there is no push delivery.
4. **Documents:** open Documents or a pet profile. Upload a real PDF/JPG/PNG/WebP; reload; preview, download, and delete it. Files must be nonempty and at most 10485760 bytes. The server checks both the declared MIME and the content signature. Signature checking does not constitute malware scanning or full PDF/image parsing. PDFs use a sandboxed iframe with an external secure-preview fallback for browsers that block embedded PDF viewers.
5. **Isolation:** use a separate browser profile for a second account. Confirm the other owner's reminders and files never appear and direct pet/document/reminder API requests return 404. Signed-out API requests return 401. Storage access with the other account's JWT should also be denied by RLS.

For existing vaccination due dates and queued cleanup, run the local job explicitly from another terminal:

```bash
npm run cron:local
```

This helper loads `.env`, never prints the secret, and targets **only localhost:3000**. It processes the database and Storage bucket configured in that running app; use a development database/bucket. It can delete objects already queued for deletion, expired uploads, or objects whose pet/document metadata has been deleted. Do not point the local app at production when testing this command. It does not send email/SMS. The fully isolated method below avoids touching any configured project.

## 5. Fully isolated safe test method

```bash
npm test
npm run test:integration
npm run lint
npm run typecheck
npm run build
```

Integration tests need local PostgreSQL 16 (`PAWTRACK_PG_BIN` can override the binary directory). They create a new temporary cluster, use synthetic identities and local Auth/Storage HTTP fixtures, and override all database, Storage, cron, and service-role values. No hosted data/files/accounts are contacted. Next.js, HTTP, Prisma, and PostgreSQL are real. The manual RLS SQL is parsed/applied twice against local stand-in Storage tables, and ownership helper/policy behavior is exercised with a local authenticated role. This does not establish that your hosted bucket/policies/keys have been configured correctly.

Tests cover manual/automatic reminders, completed/dismissed states, missing/wrong cron secrets, sequential/concurrent cron idempotence, vaccination changes, owner isolation, file size boundaries including exactly 10 MB, unsupported/spoofed types, private access, signed download URLs, partially failed uploads, injected database-finalization failures, failed deletions, and orphan cleanup after pet deletion. Fixtures/logs are retained at the printed OS temp directory and services stop after the run. There is no in-memory persistence fallback in the application.

## Scheduled processing and recovery behavior

`GET /api/cron/process-reminders` requires `Authorization: Bearer <CRON_SECRET>`. A database advisory transaction lock prevents concurrent reminder sweeps; the unique vaccination/date key prevents duplicates. The job reconciles legacy/current vaccination due dates, dismisses stale pending reminders, and marks previously unprocessed due tasks with `processedAt` exactly once. Terminal statuses are never reset. `processedAt` is bookkeeping only; in-app overdue/upcoming views are derived from due dates and don't depend on email or cron availability.

Uploads reserve both metadata and inventory **before** writing Storage. UPLOADING reservations have a 15-minute lease; SDK requests have a 30-second timeout. Successful uploads atomically become READY only while their lease is valid. Failed uploads are hidden and queued for deletion. Failed metadata finalization leaves an inventory entry, even if the database temporarily becomes unavailable.

The inventory intentionally has no Pet foreign key: it survives cascading pet/document deletion. Cleanup claims at most 25 objects with row locks/SKIP LOCKED, uses the service-role Storage API, and retries expired claims. Deletion failures return 202 and the app says deletion is queued; no success is claimed for physical removal. Successful cleanup retains private tombstones and retries deletion daily, covering late/uncertain upload outcomes. Inventory/tombstone retention is deliberate; a reviewed retention/archive policy can be added later. The endpoint reserves a bounded execution budget; remaining claims retry later. Large datasets may eventually need paginated reminder sweeps; this initial sweep is transactional and rolls back on timeout.

Preview/download URLs are signed for **60 seconds**, returned with no-store/no-referrer response headers, and not persisted in browser storage. They are bearer links: anyone with a copied link can use it until expiry, and a downloaded/cached copy cannot be revoked. Uploads set Storage cache-control to zero; the preview clears its link on expiry. No public URLs are used.

## REST endpoints

```text
GET    /api/reminders
GET    /api/pets/:petId/reminders
POST   /api/pets/:petId/reminders
GET    /api/pets/:petId/reminders/:reminderId
PATCH  /api/pets/:petId/reminders/:reminderId  {"status":"COMPLETED" | "DISMISSED"}
GET    /api/documents
GET    /api/pets/:petId/documents
POST   /api/pets/:petId/documents             multipart form: one file field
GET    /api/pets/:petId/documents/:documentId [optional ?download=1]
DELETE /api/pets/:petId/documents/:documentId
GET    /api/cron/process-reminders           server-only bearer secret
```

Manual reminder POST body: `{"title":"Vet appointment","dueAt":"2027-01-02","category":"VET_APPOINTMENT","notes":null}`. Categories: MEDICATION, VET_APPOINTMENT, OTHER. Dates are YYYY-MM-DD. Owner/source/status/parent IDs are not accepted in create bodies. Upload keys are server-generated owner/pet/UUID paths; original filenames are metadata, not object keys. API handlers independently verify/refresh sessions and are excluded from Proxy to avoid multipart body cloning/truncation at 10 MB. All API responses are no-store.

## Future Vercel deployment — not enabled

`vercel.cron.example.json` documents a daily UTC schedule; it is deliberately not an active `vercel.json`. Before a future deployment, merge that example into the project's Vercel config, configure CRON_SECRET and the cleanup key as server-only environment variables, and verify the plan's cron limits. [Vercel Cron uses a GET request with the secret in the Authorization header](https://vercel.com/kb/guide/ship-a-express-app-on-vercel).

The local Node/Next upload route supports 10 MB, including multipart overhead. **Vercel Functions limit request bodies to 4.5 MB**, so a future Vercel deployment needs a direct-to-private-Storage upload/finalization transport (with server-side validation of stored bytes) or a suitable separate upload service to preserve the 10 MB requirement. Do not deploy this upload route claiming 10 MB support on Vercel as-is. [Vercel function limits](https://vercel.com/docs/functions/limitations).

References: [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Storage schema guidance](https://supabase.com/docs/guides/storage/schema/design).

## Verification result

The implementation passed lint, strict type checking, Prisma schema validation, 27 unit tests, 24 HTTP integration scenarios (29 reported tests including five parent groups), the production build, and Git whitespace checks. The integration run included actual local PostgreSQL RLS policy evaluation and direct private-object cross-account denial. Earlier migrations and `.env` are unchanged. Hosted migration, bucket/policy setup, real hosted file operations, and browser visual/interaction QA remain manual; none is claimed as verified by the local fixture tests.
