# Phase 4 — manual Vercel deployment

PawTrack is prepared locally for GitHub-connected Vercel deployment. No deployment, hosted migration, new application database/project, Auth-setting change, secret rotation, or hosted file mutation has been performed. Keep the existing Supabase project. The UI remains unchanged.

## What changed

- The browser reserves an owned document using a small JSON request, uploads directly to a private staging key using a signed upload grant, then calls the authenticated completion API. No file body or base64 file passes through a Next.js/Vercel request or response.
- Completion reads at most 10 MiB from private Storage on the server, checks actual size, stored MIME, and magic bytes, and uploads that validated byte snapshot to a separate immutable final key. Only then does metadata become READY.
- Browser RLS never permits final-key inserts/overwrites or staging reads. A signed staging grant cannot change the published copy, even when replayed after validation. The service-role key stays server-only and is now required for verification/publication as well as cleanup.
- A VERIFYING state atomically claims completion without holding a database transaction across network I/O. Repeated successful completion returns the same metadata. Concurrent completion returns the existing result or 409; it doesn't publish another object. Lost commit acknowledgments are checked against durable READY state before cleanup.
- Staging inventory lasts beyond Supabase's two-hour signed-upload grant, even though completion reservations expire after 15 minutes. Cancellation, interrupted transfer/verification, expired claims, failed finalization, and pet deletion remain tracked. Cleanup retries safely; final objects are never replaced by unvalidated bytes.
- SQL lease checks use UTC explicitly. Prisma uses a small shared warm-instance pg pool, bounded connection/idle timeouts, and Vercel's official pool lifecycle helper. Runtime is Node.js, not Edge.
- Production Auth emails/callbacks use the configured HTTPS APP_URL and Vercel session/verifier cookies are Secure with SameSite=Lax; localhost remains supported for development. Vercel runtime also requires HTTPS Supabase URLs and an explicit database TLS mode.
- `vercel.json` enables one daily cron invocation. Builds regenerate Prisma Client but never run migrations.

## A. Review the migration and Storage policy change

1. Confirm a backup/recovery point in the **existing** Supabase project.
2. Review `prisma/migrations/202611140003_direct_uploads/migration.sql`. It only adds the VERIFYING enum value, without changing existing rows, paths, or tables. Earlier migrations are unchanged.
3. On your trusted machine, with your existing `.env` containing DIRECT_URL, run:

```bash
nvm use
npm ci
npm run db:deploy
npm run db:generate
```

Do not reset the database. `DIRECT_URL` must be a direct or session-pooler (5432) connection for migrations, not the transaction pooler (6543). Migration commands fail closed if DIRECT_URL is missing. Migrations are an explicit operator step; `npm run build` only runs `prisma generate && next build --webpack`.

4. Review and manually run the updated `docs/supabase-storage-policies.sql` in the Supabase SQL Editor. This replaces the existing narrowly scoped public ownership helper and preserves the named policies. It does not alter Storage table structures or write Storage object rows directly.
5. Keep **pet-documents private**, maximum **10485760 bytes**, MIME allowlist `application/pdf,image/jpeg,image/png,image/webp`. Do not add UPDATE or broad owner-folder INSERT policies: users must only obtain upload grants for reserved staging keys. Final keys must be writable only by the server. Existing broad policies are OR-combined and can defeat this protection; inspect them before launch.

To inspect policies manually without reading medical data:

```sql
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';
```

Apply the enum migration before the helper change. Use a controlled upload cutover: the Phase 3 multipart client is incompatible with Phase 4's JSON reservation API/policies. Pause uploads during this change and have existing browser sessions refresh after deployment. Existing READY documents and other features keep their stored data.

## B. Vercel environment variables

Set the following for **Production** in Vercel Project Settings → Environment Variables. Copy existing project credentials; do not put them in Git, chat, a URL, or a browser-visible variable.

- `APP_URL`: the exact canonical production HTTPS origin, such as `https://YOUR_ACTUAL_DOMAIN`. No path, query, credentials, or trailing callback path. On Vercel this is required; it never defaults to a localhost Auth redirect.
- `NEXT_PUBLIC_SUPABASE_URL`: your existing Supabase **HTTPS project origin**.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: your existing publishable key. This is intentionally public; RLS and server ownership checks remain mandatory.
- `DATABASE_URL`: Supabase **transaction pooler**, port **6543**, using the existing server DB role and URL-encoded password. Keep `sslmode=verify-full`; do not disable certificate or hostname checks.
- `SUPABASE_DB_CA_CERT`: the complete official Supabase database CA certificate in PEM format, including BEGIN/END CERTIFICATE lines. Required at production runtime; see the exact setup below. Server-only, without a NEXT_PUBLIC prefix.
- `SUPABASE_SERVICE_ROLE_KEY`: the existing server-only service-role key for staging verification, final publication and orphan cleanup. Never use a NEXT_PUBLIC prefix.
- `CRON_SECRET`: at least 32 random characters, server-only. Use the same value configured for the cron endpoint. Vercel sends it in the Authorization bearer header automatically.

`DIRECT_URL` is required **only on the trusted machine where you run migration commands**, not by the runtime or build. You can omit it from Vercel. `SUPABASE_STORAGE_BUCKET` is not used to select arbitrary buckets; the code fixes the name to pet-documents. Vercel supplies `VERCEL` and `VERCEL_ENV`; do not set them manually.

Keep production secrets scoped to Production. Do not give arbitrary GitHub branch/PR previews access to the production database or service-role key. Without Auth configuration, previews can show `/preview` or `/setup`. This preparation does not create another database. Do not run production-data tests from preview builds.

NEXT_PUBLIC values are build-time inputs: after changing them, redeploy. Never add private keys to `next.config.ts`'s `env` option. `.env*` and `.vercel/` are ignored; `.env.example` contains names/placeholders only.

### Database connection details

Use the Supabase Connect dialog's transaction-pooler URI for DATABASE_URL. Each warm function instance has max 3 connections, min 0, a 5-second idle timeout and a 10-second acquisition timeout; Vercel's attachDatabasePool releases idle clients before Fluid Compute suspension. This is per instance, not a global connection cap. Place the function region near the existing Supabase region and monitor aggregate pooler usage under load.

The installed Prisma 7 adapter-pg sends unnamed queries unless a statementNameGenerator is configured; this app doesn't configure one. It therefore avoids named prepared statements on the transaction pooler. Do not assume Rust-engine `connection_limit`/`pgbouncer` URL parameters configure this JavaScript pool: the pg pool settings live in `src/lib/server/db.ts`.

Production (`VERCEL=1` or `NODE_ENV=production`) requires `sslmode=verify-full` and `SUPABASE_DB_CA_CERT`. Missing/invalid CA configuration fails before the pool opens a connection. The server validates PEM CA certificates and sets `ssl.ca`, `rejectUnauthorized: true` and Node's standard `checkServerIdentity`. The installed pg driver uses the actual connection hostname for TLS verification/SNI. Keep Supabase's normal UTC database timezone. No Prisma disconnect occurs after each request and no long-running transaction spans file transfer.

### Configure the official Supabase database CA in Vercel

1. Open your **existing Supabase project**, go to **Database → Settings**, and download the **SSL/Server root certificate**. Use the certificate supplied by Supabase for this project, as described in [Supabase's SSL connection instructions](https://supabase.com/docs/guides/database/psql). Do not obtain a certificate from an arbitrary third party or copy the unverified server leaf certificate from a failed connection.
2. Open the downloaded `.cer`/`.crt` file in a text editor. Copy the entire PEM block, from `-----BEGIN CERTIFICATE-----` through `-----END CERTIFICATE-----`, including both markers. An official bundle containing multiple CA blocks is also supported. Copy **only certificate text**, without surrounding quotes, a filename, or a private key. The CA is public trust material; no database password, service-role key, or private key is needed for this step.
3. In **Vercel → your project → Settings → Environment Variables**, add `SUPABASE_DB_CA_CERT`, select **Production**, and paste that multiline text as the value. Do not name it `NEXT_PUBLIC_SUPABASE_DB_CA_CERT` or put it in `next.config.ts` or client code. Only configure other environments if they intentionally use their own authorized database settings; production credentials must remain unavailable to untrusted previews.
4. Leave the existing server-only `DATABASE_URL` on the transaction pooler hostname and port **6543**, with `sslmode=verify-full`. Do not paste the connection string into chat or documentation. Do not add an `sslrootcert` file path: Vercel does not have the downloaded local file.
5. Save the setting and manually **Redeploy** the application with the current environment variables. A running warm pool caches its configuration; editing environment variables does not reconfigure an existing deployment. After deployment, sign in and load your existing pets to verify a real authenticated query. Check that repeated requests succeed without TLS errors; do not create/delete data to test this fix.

Why the URI stays unchanged: [node-postgres documents](https://node-postgres.com/features/ssl) that URI SSL parameters replace the explicit SSL object. PawTrack first checks the original URI requires `verify-full`, then removes SSL query parameters and `uselibpqcompat` **only from the in-memory runtime URI** before passing its explicit CA/verification options to pg. The environment variable itself is unchanged. This prevents `sslmode`, `ssl`, certificate-file parameters or compatibility settings from discarding the CA or weakening verification.

For local `npm run dev` against Supabase, set the same CA in your ignored `.env`. Use a double-quoted multiline PEM value, or a double-quoted value with literal `\n` between PEM lines. CRLF line endings and escaped `\r\n` are accepted too. Do not add certificate contents to `.env.example`. Local disposable PostgreSQL fixtures can omit TLS in development; production always requires the CA and `verify-full`.

This CA variable configures **application runtime pg connections only**. It does not alter Prisma CLI migration/DIRECT_URL settings or run any migration. No database records, migrations, Auth settings or Storage policies need changing for this TLS fix. If validation still fails, check the downloaded CA is current for the project and the pooler hostname is exactly the Supabase Connect hostname. If the official CA does not validate the presented chain, resolve that with Supabase; never disable certificate/hostname verification or use `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## C. Supabase production Auth configuration

After Vercel assigns your actual stable production domain, choose **one canonical HTTPS origin** and use it consistently. For a default Vercel domain, use the stable project alias shown in the dashboard, not a random per-commit deployment URL. Replace YOUR_ACTUAL_DOMAIN below with that exact host.

In Supabase Authentication → URL Configuration, manually set:

- **Site URL:** `https://YOUR_ACTUAL_DOMAIN`
- **Redirect URLs:**
  - `https://YOUR_ACTUAL_DOMAIN/auth/callback**`
  - `https://YOUR_ACTUAL_DOMAIN/auth/recovery**`
  - `http://localhost:3000/**` for local development only

The callback-scoped suffix patterns accommodate the installed SDK's `sb_flow_id` query parameters. Do not use a wildcard for the entire production domain, other hosts, or preview deployments. Callback destinations are fixed paths, not arbitrary `next` parameters. APP_URL in Vercel must equal Site URL's origin. If you later choose a custom domain, update both, update these callback entries, and redeploy manually.

Keep Signup/Reset Password templates using `{{ .ConfirmationURL }}` so Supabase verifies the email link and the server exchanges the PKCE code. Open links in the browser/profile that initiated signup/recovery. Do not replace templates with plain links to `/reset-password`. Reset submissions verify the authenticated user server-side again. Production SMTP, rate limits/CAPTCHA and secure-password-change/reauthentication settings are provider configuration choices; review them manually rather than assuming the app has changed them.

For local development keep `.env` APP_URL=`http://localhost:3000`; this server-only setting is separate from the production value. Do not change the shared Supabase Site URL back and forth to test local email flows; the app passes its explicit local callback and the localhost allowlist permits it.

## D. GitHub-connected Vercel deployment — manual only

1. Review the changes and run the commands in section F. Commit/push code and the lockfile yourself. Verify `.env`, service keys and `.vercel/` are not tracked.
2. In Vercel choose **Add New → Project → Import** and select the existing GitHub repository. Do not provision a new Supabase integration/project/database; reuse the current connection settings.
3. Choose **Next.js**, root directory containing package.json, **Node 24.x**, install command `npm ci`, build command `npm run build`, and the default Next.js output directory. `vercel.json` declares these commands/framework; package.json pins Node 24.x. Keep Fluid Compute enabled if offered. Do not add a migration command to install/build hooks.
4. Add Production environment variables from section B before enabling the full app. Confirm the actual production domain Vercel assigns; set APP_URL to its HTTPS origin and configure section C. If the actual domain differs from the proposed project name, correct APP_URL and redeploy. No live settings are changed by these instructions.
5. Confirm the reviewed enum migration and Storage helper change are applied before serving the new upload flow. Manually trigger the deployment or click **Deploy**. Future pushes on your selected production branch will trigger GitHub-connected builds; choose that branch deliberately.
6. In the deployment logs confirm Prisma Client generation, Next compilation, and no migration execution. Verify the function region and Supabase connection pooler usage.
7. In Project Settings → Cron Jobs confirm `/api/cron/process-reminders` uses `0 0 * * *`. The job runs only on Production. It sends no email/SMS. `vercel.cron.example.json` is historical documentation; `vercel.json` is the active configuration.
8. Finish section G before sharing the public app. If a deployment fails, fix configuration and redeploy; do not reset the database. Rollback of app code alone does not reverse the new upload helper; coordinated rollback would also need the previous helper during a controlled upload pause. Keep the additive enum value—do not drop it to roll back.

## E. Cron, cleanup, and upload behavior on Vercel

The daily UTC schedule is compatible with Hobby's once-per-day cron limit. Hobby can invoke anywhere within the selected hour; don't promise minute-precise notifications. Vercel may overlap or miss invocations; the job is idempotent and can be invoked again by an authorized operator. It uses a timing-safe bearer-secret check, transaction/advisory locks for reminders, and SKIP LOCKED claims for cleanup. The route has a 60-second maximum and a bounded internal budget.

Staging reservations accept completion for 15 minutes. Supabase signed upload grants last two hours and cannot individually be revoked, so staging inventory persists for two hours plus a five-minute grace. A late/replayed staging upload remains private, cannot modify a published copy, and is cleaned after the grant is invalid. Abandoned VERIFYING claims become eligible after five minutes. On Hobby, expired/failed objects may wait until the next daily sweep (or an authorized manual invocation). They remain tracked and unavailable through document APIs while waiting.

Cleanup handles at most 25 inventory items per run and retains private deletion tombstones for safe repeated removal. Monitor failed/skipped counts and backlog. Higher volume may need a reviewed batch/retention policy or a plan with more frequent processing. Missing service-role configuration is a deployment blocker for uploads and cleanup, not a reason to make the bucket public.

Only small metadata travels through Vercel HTTP request/response bodies. The server reads a bounded staging stream and writes the validated snapshot **outbound** to Storage; it never returns those bytes to the browser. Private document preview/download still uses 60-second signed URLs. File signature checking isn't malware scanning/full PDF parsing; the PDF viewer remains sandboxed with an isolated secure-link fallback. Already downloaded files and copied short-lived bearer links cannot be instantly revoked.

## F. Local checks

```bash
nvm use
npm ci
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run check:secrets
```

The existing isolated harness uses temporary local PostgreSQL fixtures with a generated one-day TLS certificate (requires `openssl`) and simulated upstream Auth/Storage services, never the existing Supabase database. It does not provision a new application database. It evaluates the actual policy helper in PostgreSQL, including a non-UTC session, and exercises direct transfers, exactly 10 MiB, invalid content/size, missing/cross-account auth, wrong paths, staging replay, concurrent finalization, interrupted reservations, cleanup and cron idempotence. A normal Vercel deploy does not run this fixture harness.

The targeted secret check examines Git-visible files and built browser assets without printing key values. It is not a complete Git-history/security audit. The build regenerates Prisma Client independently of migrations; `DIRECT_URL` isn't required to build.

For manual local testing after applying the reviewed migration/helper, run `npm run dev` and use localhost:3000. Check the browser Network panel: the large PUT goes to the Supabase Storage host; the app receives only a JSON reservation and `{}` completion request. `npm run cron:local` explicitly targets localhost and uses that running app's configured database/bucket. It can remove queued objects, so use it only with your intended development setup. None of these production-data operations were run automatically.

## G. Final production testing checklist

Use accounts and disposable records/files you control; do not destructively test other users' data.

- [ ] HTTPS canonical domain works; no redirects point to localhost or an untrusted Host/next URL.
- [ ] Signup email confirms in the initiating browser; login/logout work and protected pages reject signed-out access.
- [ ] Forgot/reset password returns to the production recovery callback, rejects expired/reused links and saves a valid password only for the authenticated user.
- [ ] Two accounts see only their own pets, health records, reminders and documents. Direct cross-account GET/update/delete/complete calls return 404; signed-out API calls return 401.
- [ ] Existing pets/health records/documents remain intact after the additive migration/helper change.
- [ ] A file above 4.5 MB and an exactly 10485760-byte file upload successfully via direct Storage PUT, then appear only after server verification. No file body passes through a Vercel function.
- [ ] Oversize, spoofed MIME/signature and size-mismatched transfers never become READY; arbitrary owner/path input is rejected. A staging grant cannot write a final key.
- [ ] Interrupted uploads remain hidden and are eventually cleaned. Replay after validation cannot change the published file. Duplicate completion doesn't duplicate metadata or objects.
- [ ] Private preview/download URLs expire after 60 seconds; public bucket URLs and another owner's Storage JWT cannot read the file. Browser CORS/preflight succeeds for the direct PUT.
- [ ] Delete and pet deletion eventually remove both final/staging objects, with failed cleanup visible in authorized job counters and safely retryable. Verify at least one cleanup after staging-grant expiry.
- [ ] Cron rejects missing/wrong secrets, runs once daily on Production, and repeat executions don't duplicate reminders or reopen terminal states. Monitor actual Vercel run logs, not only a local request.
- [ ] The official CA is configured in Production; missing/malformed CA fails closed. Certificate-chain and hostname verification remain enabled.
- [ ] Prisma pooler connections work on repeated warm/cold requests; no TLS/prepared-statement/connection exhaustion errors. Supabase database and bucket usage stay within your plan.
- [ ] Production env values aren't in browser assets, responses or logs; production secrets aren't available to PR/preview deployments.
- [ ] Mobile layouts, keyboard controls, upload errors, file preview fallback and all loading/empty/success states behave correctly in a real browser.

## Dependency/security review and remaining verification

Production dependency audit reported zero advisories after adding the official Vercel pool helper. Seven moderate advisories remain in development-only TypeScript ESLint/minimatch tooling; npm's latest TypeScript ESLint was still 8.72.2 during this review. No forced transitive major override or broad framework migration was introduced. ESLint 9 also emits a maintenance/deprecation warning; a tooling upgrade should be reviewed separately before CI executes untrusted input/globs.

Hosted Vercel execution, real Supabase Storage CORS/policies, email delivery, provider abuse controls and live domain configuration cannot be established by fixture tests. No production deployment or live-setting update has been performed. The application has no additional distributed upload rate limiter; monitor authenticated-user storage usage/quotas and provider limits before opening unrestricted signup at scale. No compliance or malware-scanning certification is implied.

Official references: [Vercel Function limits](https://vercel.com/docs/functions/limitations), [Hobby cron frequency/precision](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Vercel pool lifecycle](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#attachdatabasepool), [Supabase signed uploads](https://supabase.com/docs/reference/javascript/file-buckets-uploadtosignedurl), [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Local verification results

Lint, strict type checking, Prisma validation, 38 unit tests, 26 HTTP integration scenarios (31 reported tests including parent groups), production build, targeted secret/browser-asset scan, and Git whitespace checks passed. Exactly 10 MiB direct upload and immutable publication were exercised through real Next HTTP, Prisma and disposable PostgreSQL with local Auth/Storage fixtures. Existing `.env` and all prior migration files are unchanged. No hosted migration, new application database, deployment, live Auth/Storage-policy change or credential commit occurred. The production checklist above remains a manual post-deployment requirement.

The TLS follow-up also passed lint, strict type checking, all 38 unit tests, all 31 reported HTTP integration tests, and a production build. Integration PostgreSQL used an ephemeral local CA with certificate/hostname verification enabled. Unit tests cover missing/malformed CA, PEM newline formats/bundles, full verification after the installed pg URI parser runs, and rejection of a mismatched hostname. The official project CA and hosted Vercel/Supabase handshake still require the manual configuration and post-redeploy verification above. No existing migration or Storage-policy files were modified for this fix.
