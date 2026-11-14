# PawTrack

A pet health workspace built with Next.js App Router, strict TypeScript, Tailwind CSS, shadcn/ui-style source components, Prisma/PostgreSQL, and Supabase Auth. Supports owner-scoped pet profiles, health records, persistent care reminders, and private medical documents. The public `/preview` is explicitly sample UI, isolated from the database; it is never an authentication bypass.

## Phase 3 setup

Read [Phase 3 local setup and verification](docs/phase3-local-setup.md) before running the new features. The new migration, private bucket, Storage policies, and server-only cron/cleanup keys require manual setup. No hosted migration or deployment was performed.

## Requirements

- Node.js 22.12+ (Node 24 recommended; `.nvmrc` included), npm
- A Supabase project with email/password Auth and PostgreSQL
- The server-side Storage cleanup worker needs a service-role key in Phase 3; normal user operations use session-based RLS.

## Local setup

1. Run `nvm use` (or select Node 24 with your version manager), then `npm ci`.
2. Copy `.env.example` to `.env` and fill in the four connection values. Never commit `.env`.
3. In Supabase **Project Settings → API**, copy the project URL and publishable key into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The publishable key is intentionally public. Database URLs remain server-only.
4. In **Connect**, copy the transaction pooler URI (port 6543) into `DATABASE_URL`. Copy the direct URI into `DIRECT_URL`. If your computer only supports IPv4, use the session pooler URI (port 5432) for `DIRECT_URL`. Use the database password, URL-encoded when it contains special characters. Require SSL as specified in your Supabase connection string; do not disable certificate verification.
5. In **Authentication → Providers**, enable email/password. Keep email confirmation enabled. In **Authentication → URL Configuration**, set Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` as an allowed redirect URL. The signup confirmation uses Supabase's PKCE code exchange and should be opened in the same browser that initiated signup. Use Supabase's default confirmation URL template. Configure a production SMTP provider before public launch.
6. Run `npm run db:deploy` to apply the committed migrations. This requires a real database; it does not create fake or in-memory persistence.
7. Run `npm run dev`. Open [localhost:3000](http://localhost:3000), create an account, confirm the email, and sign in.

Without Auth configuration, protected pages redirect to `/setup`. `/login` and `/signup` explain missing configuration. `/preview` can be viewed without credentials and uses sample photos from Unsplash; photos may require internet access. No development user or mock auth exists. The production dashboard never falls back to sample data when a query fails.

## Commands

- `npm run dev` — local development
- `npm run lint` — ESLint
- `npm run typecheck` — Prisma generation, Next route types, strict TypeScript
- `npm test` — validation, health-status, unit-conversion, and ownership unit tests (no credentials needed)
- `npm run build` / `npm start` — production build / server
- `npm run db:generate` — regenerate Prisma Client
- `npm run db:migrate -- --name describe_change` — create/apply a development migration after schema edits
- `npm run db:deploy` — apply committed migrations in a configured environment
- `npm run db:studio` — inspect the development database

Prisma 7 uses `prisma.config.ts` for CLI connections and `@prisma/adapter-pg` for runtime connections. The config contains an explicitly unconfigured localhost URL solely to allow schema generation/builds without secrets; the runtime refuses to connect without `DATABASE_URL`. There is no local database fallback. Prisma output is generated into `src/generated/prisma` and ignored by Git.

## Project structure

```text
src/app/(workspace)/    Protected dashboard, pets, future-feature pages
src/app/api/pets/       GET / POST; [id] GET / PUT / DELETE
src/app/auth/          Server actions and email confirmation callback
src/app/login, signup  Email/password authentication
src/app/preview        Explicit sample UI, no persistence
src/app/setup          Configuration guidance
src/components/        Shell, dashboard, Pet CRUD forms, auth UI
src/components/ui/     Reusable shadcn/ui-style Button, Input, Card
src/lib/server/        Server-only auth, Prisma access, Pet service, HTTP validation
src/lib/supabase/      Supabase server client and configuration checks
src/lib/              Shared Zod schema, ownership predicates, utilities
src/proxy.ts           Supabase session cookie refresh (Next.js 16 Proxy)
prisma/                Schema and versioned migrations
tests/                 Validation and ownership tests
```

## Data and authorization

Supabase owns credentials and identities. The Prisma `User.id` is the verified Supabase UUID; the server creates this minimal app profile atomically with the first pet. Email/password are never stored in Prisma. Multiple pets belong to one user. Deleting a pet cascades related records, so the UI requires explicit confirmation.

Every API method validates the session with Supabase `getUser()`. All individual reads, updates and deletes use both pet ID and authenticated owner ID; missing and foreign-owned pets both return 404. List queries are owner-scoped. Create derives ownerId from the session. Zod rejects additional fields including ownerId. PUT replaces the editable profile fields; weight is kg, dates are UTC calendar dates. Writes require a same-origin Origin header, JSON bodies are limited to 16 KiB, and errors omit database details. API authorization is independent of layout guards. Personalized routes are dynamic and uncached.

The initial migration enables RLS on every application table with no public policies. Direct Supabase anonymous/authenticated Data API access is therefore denied. Prisma must use the server-only database role from Supabase Connect (normally `postgres`, which bypasses RLS). App ownership checks are the authorization boundary for those privileged server queries. Do not expose database credentials or add broad public RLS policies. Health-record routes authorize through the parent pet on every read and write. Account deletion/cleanup is not implemented; deleting an Auth user does not automatically remove its separate app profile.

Photo URLs are optional HTTPS links displayed by the browser with unoptimized Next Image; the server never fetches them. Phase 3 implements private file uploads; follow the Phase 3 setup guide. Phase 3 uses the fixed private bucket name pet-documents. Before uploads, create a **private** bucket and owner-based Storage policies; never make medical files public.

## Verification boundary and acceptance checks

Unit tests exercise input rules and the shared ownership predicate. They do **not** establish that hosted authentication, migrations, or cross-account database isolation work. A production build also does not connect to the database. Verify these against your own configured development Supabase project:

1. Apply migrations, sign up users A and B, confirm both emails, and sign in in separate browser profiles.
2. As A, create two pets; reload and verify persistence. View/edit optional fields, remove a value, reload, then delete a pet and verify it stays deleted.
3. As B, confirm A's pets never appear. Request GET, PUT, DELETE `/api/pets/<A-pet-id>` using B's session; each must return 404 and leave A's pet unchanged. For writes, send JSON and the app's Origin header.
4. While signed out, call both pet API paths: expect 401. Visit protected pages: expect `/login`. Without configuration API requests return 503 and pages redirect to `/setup`.
5. POST JSON with a forged ownerId: expect 422. Invalid calendar dates, negative weights, unsupported species and oversized bodies must fail.
6. Sign out and confirm protected data is inaccessible, including after navigating back/reloading. Exercise expired-session refresh and invalid confirmation links.
7. Using a Supabase client with only the publishable key, confirm direct table reads/writes are blocked by RLS.
8. Test mobile navigation, keyboard form traversal, Escape/close behavior, and loading/error states on desktop/mobile browsers.

## Future Vercel deployment

Import the repository into Vercel, use Node 24, set the same environment variables for each intended environment, and apply `npm run db:deploy` to that environment's database before serving traffic. Add the exact HTTPS production origin and `/auth/callback` URL to Supabase Auth. Do not use a production database for preview deployments. Build runs Prisma generation without a database connection; migrations are an explicit deployment step. Configure provider rate limits/SMTP and run the acceptance checklist before public launch.

## Future phases

Phase 3 implements in-app reminders and private documents. Email/SMS delivery remains unimplemented, and Vercel deployment remains manual. See the Phase 3 setup guide for the upload transport change required before a future Vercel deployment.

## Local verification (2026-11-11)

- `npm run lint`: passed with no warnings.
- `npm run typecheck`: passed.
- `npm test`: 7 tests passed.
- `npx prisma validate`: passed; initial SQL generated with Prisma migrate diff.
- `npm run build`: passed using Next.js's supported Webpack compiler. Both dev and build scripts select Webpack because Turbopack's CSS worker could not bind a port in this execution environment.
- Compiled app HTTP checks: `/preview` 200; `/dashboard` 307 to `/setup`; unconfigured `/api/pets` 503.
- Browser automation timed out, so visual/mobile/keyboard QA remains unverified.
- No credentials were provided: hosted Auth, applying migrations, persisted CRUD, and cross-account database checks remain unverified.
- `npm audit --omit=dev`: 0 production vulnerabilities reported.
- `npm audit` reports 7 moderate development-tooling advisories through TypeScript ESLint's minimatch dependency; `npm audit fix` did not resolve them. Review upstream updates before enabling CI on untrusted input.

Implementation references: [Next.js Proxy](https://nextjs.org/docs/app/getting-started/proxy), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Prisma 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).

## Forgot / reset password

The login page links to `/forgot-password`. Recovery requests use the existing server-side Supabase client and PKCE cookies. `/auth/recovery` exchanges the email's single-use code (including `sb_flow_id` when present), then redirects to `/reset-password`. Invalid, expired, reused, and non-recovery codes return to the request page. Open the email in the **same browser/profile** that requested it; PKCE needs the verifier cookie. The callback only uses fixed local destinations, never a `next` URL from the request.

The reset page requires a verified Supabase session. The server action independently revalidates that session, checks matching passwords (8–128 characters), and calls `auth.updateUser({ password })` for that session's user. Supabase's additional password policies also apply. A signed-in user can also use this page to update their own password. Successful updates sign out the current browser via `scope: "local"`; no admin APIs, user deletion, pet access, or database migrations are involved. Other-session revocation follows Supabase's password-change behavior.

Configure Supabase **Authentication → URL Configuration**:

1. Set **Site URL** to `http://localhost:3000`.
2. Keep `http://localhost:3000/auth/callback` for signup confirmation.
3. Add `http://localhost:3000/**` to **Redirect URLs** for local development. This includes `/auth/recovery` and the PKCE flow query parameters the installed SDK may append. Do not use a localhost wildcard as your production allowlist.
4. Use `http://localhost:3000` consistently, including when requesting the email; do not switch to `127.0.0.1` or another browser when following the link.
5. Under **Email Templates → Reset Password**, keep the standard link using `{{ .ConfirmationURL }}`. A custom template must preserve that confirmation link; a plain link directly to `/reset-password` does not verify recovery.
6. `APP_URL` defaults to `http://localhost:3000` if omitted. For deployment set it to your canonical HTTPS origin and allow its recovery callback in Supabase, including SDK flow query parameters. It must be an origin without a path or query. `.env.example` contains this setting; existing `.env` is not changed.

Email delivery requires Supabase's email service or configured SMTP and is subject to provider rate limits. Recovery responses do not reveal whether the account exists. Passwords, codes and auth error details are not logged by this flow.

Manual verification (use an account you control): request a reset, open the email in the same browser, submit mismatched/short passwords, then save a valid new one and sign in again. Check expired/reused links, missing-session submission, and requesting a new email after opening a link in another browser. These hosted email/password-change checks are **not run automatically**, because they send email and change account credentials. Unit tests use fake Supabase responses only; they never access existing users or pet data.

## Phase 1 authorization integration tests

Run `npm run test:integration` using Node 24 and a local PostgreSQL 16 installation. On this Mac the runner uses `/opt/homebrew/opt/postgresql@16/bin`; elsewhere set `PAWTRACK_PG_BIN` to the directory containing `initdb` and `pg_ctl` (for example `PAWTRACK_PG_BIN=/usr/lib/postgresql/16/bin npm run test:integration`). PostgreSQL must run as a non-root OS user. No Docker or Supabase credentials are required.

The runner creates a **new disposable PostgreSQL cluster in the OS temp directory**, binds it to loopback on a temporary port, and applies committed migrations in order only to that cluster. It overrides `DATABASE_URL`, `DIRECT_URL`, and both Supabase settings in the app process. It does not migrate, seed, reset, query, or write to your hosted Supabase database, and does not create, delete, or change hosted Auth users. Auth tokens and identities are generated fixtures, not existing test accounts.

Tests call the actual compiled Next.js HTTP endpoints with the installed Supabase SSR client, real Prisma queries, and real PostgreSQL persistence. Only the upstream Supabase Auth HTTP service is simulated; it accepts fixture tokens and rejects forged/missing ones. Tests exercise both users' direct GET/PUT/DELETE attempts against each other's pet IDs; owner-only listing; nonexistent/foreign-ID equivalence; missing/forged sessions on every method; forged ownerId; Origin/JSON/body limits; and authorized persisted CRUD. Callback tests use the actual installed SDK's PKCE verifier cookies and flow-ID exchange to check session cookies, fixed redirect destinations, expired/reused links, and cache/referrer headers.

The test build is isolated in ignored `.next-integration/`. The runner stops its app/Auth/PostgreSQL processes on normal completion or failure and restores any TypeScript config changes made by Next's integration build. Temporary database files/logs are retained in the printed temp directory for diagnosis. It never deletes another database. Do not run concurrent integration suites in the same checkout. An abrupt OS/process kill can leave the disposable cluster running; stop only that cluster using its printed temp data directory (`pg_ctl -D <that-temp-directory>/postgres -m fast -w stop`), never an existing development/Supabase instance.

These tests establish application authorization and PostgreSQL query behavior. They do not verify Supabase's hosted JWT signature checks, SMTP delivery, provider rate limits/password policies, deployed redirect allowlists, or the current hosted RLS grants/policies. Your manually verified hosted flows complement this automated coverage. No authenticated security test is run against production data.

Security review changes: signup confirmation now uses the canonical `APP_URL` callback instead of a request-supplied Origin; the signup callback honors PKCE flow IDs and fails closed on invalid codes/upstream errors; both auth callbacks are explicitly uncached with `no-referrer` protection in Next's global headers; signed-out API writes return 401 before Origin checks; JSON content types are matched exactly. Existing schema and migration files are unchanged. Signed-in users may update their own password with a verified session; there is no additional current-password/reauthentication requirement in the app. Before public launch, review Supabase's secure password-change settings and abuse controls. The app currently relies on Supabase's Auth rate limiting and has no additional application-level rate limiter or CAPTCHA.

### Review verification (2026-11-14)

- Lint, strict type checking, 16 unit tests, and 11 HTTP integration scenarios (13 reported tests including the two parent groups) passed.
- The isolated integration build and standard production build both passed.
- A separate hosted metadata query ran in a `READ ONLY` transaction: all eight application tables have RLS enabled and zero policies. No pet/user rows were queried and no policies, accounts, schema, or records were changed.
- `npm audit --omit=dev` reports zero production advisories. The full audit still reports seven moderate development-tooling advisories in the TypeScript ESLint/minimatch chain; no dependency overrides or major upgrades were introduced during this review.
- Hosted JWT validation, SMTP delivery, provider password policies/abuse controls, and deployed redirect settings remain outside the isolated test boundary. This review did not change account passwords or send emails. Phase 2 has not started.

## Phase 2 — Pet Health Records

Health Records and Medications are now live features. In **My Pets**, choose **Health** on a pet card to open `/pets/<id>`, or use the companion selector on `/health-records` or `/medications`. Every page and API requires Supabase authentication and scopes records through the pet's verified owner.

### Apply the reviewed migration

The new migration is `prisma/migrations/202611140001_health_records/migration.sql`. It has been reviewed and tested against disposable PostgreSQL containing Phase 1 rows. It only adds notes, optional legacy-compatible reason/frequency fields, creation/update timestamps with defaults, and a vaccination due-date index. It does not drop/rename columns, reset tables, or rewrite existing user/pet values. The initial migration is unchanged and RLS remains enabled on the same tables, with no public client policies added.

**The Phase 2 migration has not been applied to your existing Supabase database.** Before using the new pages, take/confirm a backup or Supabase recovery point, review the SQL, confirm `.env` points to the intended database, and run:

```bash
nvm use
npm ci
npm run db:deploy
npm run db:generate
npm run dev
```

`db:deploy` applies pending migrations; do not use `migrate reset` or `db push` for this upgrade. No new secret or Supabase configuration is required beyond your working Phase 1 setup. Existing deployments using Phase 1 can tolerate the additive database changes. This work has not been deployed.

### Behavior and data rules

- **Weights:** dated full CRUD; interactive line chart with focus/hover/tap inspection and 30-day/90-day/all-time filters; kg/lb display and entry conversion. PostgreSQL stores kg at two-decimal precision. The newest measurement date wins (creation time and ID break ties), so backdated entries do not replace the latest weight. Editing/deleting history immediately affects the derived latest weight after refresh. Existing `Pet.weight` remains a profile baseline and is displayed only when no dated record exists; it is never fabricated into history or silently overwritten by a weight log. Weight list and chart units can be selected independently.
- **Vaccinations:** name, administered date, optional next due date, and notes. Due dates are labeled Upcoming, Due today, Overdue, or No due date. Each administration is a separate record; adding a later vaccine does not automatically resolve a previous record's due date—edit its due date if that is the intended correction.
- **Vet visits:** date, clinic, required reason, optional notes, newest date first. Legacy visits without a reason display “Reason not recorded”; enter a reason when editing them.
- **Medications:** name, dosage, frequency, start, optional end, notes. Active includes the start and end dates; Scheduled means the start is in the future; Historical means the end is before today. The list supports all three status filters. Legacy `instructions` are preserved by migration and shown as notes until the record is explicitly edited; an edit moves the submitted note into `notes` and clears the old duplicate instructions field. Legacy missing frequency is shown honestly and must be supplied on edit.
- Calendar dates and statuses use **UTC**, including “today.” Recorded weight, administered vaccine, and completed vet-visit dates cannot be in the future; medication start dates may be future dates. Due/end dates cannot precede their start/administered date. Fields are bounded; weight must be positive and at most 9999.99 kg; notes at most 4000 characters. No ownership/parent IDs are accepted from JSON bodies.
- Dashboard cards show real record counts, active medication counts, latest pet weights, weight trends, and vaccination due dates. Email reminders and uploads remain unimplemented. The separate `/preview` remains explicitly sample UI.

### REST API

The resource names are `weights`, `vaccinations`, `vet-visits`, and `medications`:

```text
GET    /api/pets/:petId/:resource              -> { records: [...] }
POST   /api/pets/:petId/:resource              -> { record: {...} }, 201
GET    /api/pets/:petId/:resource/:recordId    -> { record: {...} }
PUT    /api/pets/:petId/:resource/:recordId    -> { record: {...} }
DELETE /api/pets/:petId/:resource/:recordId    -> 204
```

PUT replaces the editable record fields. Dates in request/response DTOs are `YYYY-MM-DD`. Send JSON and a same-origin `Origin` header on writes. Resource bodies:

```json
{"weightKg": 12.25, "recordedAt": "2026-01-02", "notes": null}
{"name": "Rabies", "administeredAt": "2026-01-02", "nextDueAt": "2027-01-02", "notes": null}
{"visitedAt": "2026-01-02", "clinic": "Paw Clinic", "reason": "Annual exam", "notes": null}
{"name": "Prescription", "dosage": "1 tablet", "frequency": "Daily", "startsAt": "2026-01-02", "endsAt": null, "notes": null}
```

Unauthenticated requests return 401; foreign/missing pet or record returns 404; invalid UUID returns 400; invalid input returns 422; invalid Origin returns 403. A record cannot be moved or accessed by substituting another owned pet ID. Every read/update/delete predicate includes both the parent pet and verified owner. Creation connects only to an owned pet. Database errors do not expose credentials or SQL.

### Testing and verification

`npm test` includes date boundaries, unit conversion, weight limits, input validation, and vaccination/medication statuses. `npm run test:integration` applies all migrations in order only to a newly created temporary local PostgreSQL cluster. It seeds the old schema before upgrading and asserts legacy pet weights, visit notes, medication instructions, and new timestamp defaults survive. Auth's upstream HTTP responses are simulated; Next route handlers, Prisma, PostgreSQL, and HTTP requests are real.

The HTTP suite exercises all four resources' CRUD, missing/forged sessions, cross-account and wrong-parent access, attempts to forge petId/ownerId, invalid date ranges, record ordering, date-aware latest weight, deletion fallback, cross-origin writes, and protected page rendering without data leakage. Next.js may stream a 200 loading shell before rendering not-found/login redirects; page checks assert the denial content and absence of private data, while API denials must return their explicit 401/404 status.

After applying the migration, manually verify on localhost with your two existing accounts: create/edit/delete each record type, refresh, switch weight units/ranges, check due/medication status, and confirm the second account cannot see or directly access the first account's records. The implementation has not sent email, changed passwords, or altered hosted records as part of automated tests. Browser interaction/visual QA is separate from HTTP/SSR tests.

Phase 2 verification: `npm run lint`, `npm run typecheck`, `npx prisma validate`, 23 unit tests, 16 HTTP integration scenarios (19 reported tests including three parent groups), and `npm run build` passed. The migration preservation check passed against real disposable PostgreSQL. The final unit run also covers year-zero date rejection and PostgreSQL-incompatible null characters. Hosted Phase 2 migration/application, browser visual/interaction QA, and manual two-account health-record acceptance checks remain outstanding. No deployment was performed.
