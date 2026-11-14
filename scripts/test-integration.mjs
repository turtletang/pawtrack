// Real Next HTTP + Prisma + disposable PostgreSQL. No .env is read by this runner.
import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { storageFixture } from "../tests/integration/storage-fixture.mjs";

const root = resolve(import.meta.dirname, "..");
const directory = await mkdtemp(join(tmpdir(), "pawtrack-integration-"));
const dataDir = join(directory, "postgres");
const pgBin = process.env.PAWTRACK_PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const tsconfigPath = join(root, "tsconfig.json");
const originalTsconfig = await readFile(tsconfigPath, "utf8");
let app; let database; let postgresStarted = false;
const auth = createServer();
function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
async function freePort() {
  const server = createNetServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
function token(sub) {
  return `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000), role: "authenticated", aud: "authenticated" })).toString("base64url")}.${randomBytes(32).toString("base64url")}`;
}
const tokenA = token(ownerA); const tokenB = token(ownerB);
const usedCodes = new Set();
const identities = new Map([[tokenA, ownerA], [tokenB, ownerB]]);
const cronSecret = "fixture-cron-secret-" + randomBytes(24).toString("hex");
const serviceKey = "fixture-service-key-" + randomBytes(24).toString("hex");
const handleStorage = storageFixture({ identities, serviceKey, database: () => database });
auth.on("request", async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url.startsWith("/storage/v1/") || request.url.startsWith("/test-storage-stats")) { await handleStorage(request, response); return; }
  if (request.url === "/auth/v1/user" && request.method === "GET") {
    const id = identities.get(request.headers.authorization?.replace(/^Bearer /, ""));
    response.statusCode = id ? 200 : 401;
    response.end(JSON.stringify(id ? { id, aud: "authenticated", role: "authenticated", email: `${id}@example.test`, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } : { message: "Invalid token", code: "bad_jwt" }));
  } else if (request.url === "/auth/v1/token?grant_type=pkce" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const { auth_code: code, code_verifier: verifier } = JSON.parse(body);
    if (["signup-code", "recovery-code", "callback-recovery-code"].includes(code) && verifier === "integration-verifier" && !usedCodes.has(code)) {
      usedCodes.add(code);
      response.end(JSON.stringify({ access_token: tokenA, refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 3600,
        user: { id: ownerA, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } }));
    } else {
      response.statusCode = 400;
      response.end(JSON.stringify({ message: "Invalid or expired code", code: "flow_state_not_found" }));
    }
  } else {
    response.statusCode = 400;
    response.end(JSON.stringify({ message: "Invalid or expired code", code: "flow_state_not_found" }));
  }
});
try {
  const pgPort = await freePort(); const appPort = await freePort();
  await new Promise(resolve => auth.listen(0, "127.0.0.1", resolve));
  const authUrl = `http://127.0.0.1:${auth.address().port}`;
  // New cluster, loopback only, unrelated to any existing local or hosted database.
  await run(join(pgBin, "initdb"), ["-D", dataDir, "-U", "pawtrack_test", "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  await run(join(pgBin, "pg_ctl"), ["-D", dataDir, "-l", join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${pgPort} -k ${directory}`, "-w", "start"]);
  postgresStarted = true;
  const databaseUrl = `postgresql://pawtrack_test@127.0.0.1:${pgPort}/postgres`;
  database = new pg.Pool({ connectionString: databaseUrl });
  for (const migration of (await readdir(join(root, "prisma/migrations"))).filter(name => /^\d/.test(name)).sort()) {
    await database.query(await readFile(join(root, "prisma/migrations", migration, "migration.sql"), "utf8"));
    if (migration === "202611110001_initial") {
      // Populate the old schema before upgrade to prove the additive migration preserves data.
      await database.query(`
        INSERT INTO "User" (id, "updatedAt") VALUES ('33333333-3333-4333-8333-333333333333', now());
        INSERT INTO "Pet" (id, "ownerId", name, species, weight, "updatedAt") VALUES ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 'Legacy fixture', 'Dog', 7.5, now());
        INSERT INTO "WeightRecord" (id, "petId", "weightKg") VALUES ('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444', 7.5);
        INSERT INTO "Vaccination" (id, "petId", name, "administeredAt") VALUES ('66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444444', 'Legacy vaccine', now());
        INSERT INTO "VetVisit" (id, "petId", "visitedAt", clinic, notes) VALUES ('77777777-7777-4777-8777-777777777777', '44444444-4444-4444-8444-444444444444', now(), 'Legacy clinic', 'Preserve notes');
        INSERT INTO "Medication" (id, "petId", name, dosage, instructions, "startsAt") VALUES ('88888888-8888-4888-8888-888888888888', '44444444-4444-4444-8444-444444444444', 'Legacy prescription', '1 tablet', 'Preserve instructions', now());
        INSERT INTO "Reminder" (id, "petId", title, "dueAt", "completedAt") VALUES ('99999999-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444', 'Legacy completed', now(), now());
        INSERT INTO "Document" (id, "petId", name, "storagePath", "mimeType") VALUES ('99999999-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'Legacy file', 'legacy/private.pdf', 'application/pdf');
      `);
    }
  }
  const legacy = await database.query(`SELECT p.weight::text, w."weightKg"::text, v.notes AS visit_notes, m.instructions, m.frequency, v.reason,
    w."createdAt" IS NOT NULL AND m."updatedAt" IS NOT NULL AS timestamps_backfilled
    FROM "Pet" p JOIN "WeightRecord" w ON w."petId" = p.id JOIN "VetVisit" v ON v."petId" = p.id JOIN "Medication" m ON m."petId" = p.id
    WHERE p.id = '44444444-4444-4444-8444-444444444444'`);
  const preserved = legacy.rows[0];
  if (!preserved || preserved.weight !== "7.50" || preserved.weightKg !== "7.50" || preserved.visit_notes !== "Preserve notes" || preserved.instructions !== "Preserve instructions" || preserved.frequency !== null || preserved.reason !== null || !preserved.timestamps_backfilled) throw new Error("Migration failed legacy-row preservation check.");
  console.log("Migration review verified: legacy pet, weight, visit notes, and medication instructions preserved; nullable fields and timestamps backfilled safely.");
  // Validate the manual policy SQL against local stand-in Storage tables, never Supabase schemas.
  await database.query(`CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects (name text PRIMARY KEY, bucket_id text NOT NULL);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO authenticated;
    GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;`);
  await database.query(await readFile(join(root, "docs/supabase-storage-policies.sql"), "utf8"));
  // Reapplying the setup must preserve the same policies without duplication.
  await database.query(await readFile(join(root, "docs/supabase-storage-policies.sql"), "utf8"));
  const legacyCare = await database.query(`SELECT r.status, d.status AS document_status, s.path FROM "Reminder" r
    JOIN "Document" d ON d."petId"=r."petId" JOIN "StorageObject" s ON s.path=d."storagePath"
    WHERE r.id='99999999-1111-4111-8111-111111111111'`);
  if (legacyCare.rows[0]?.status !== "COMPLETED" || legacyCare.rows[0]?.document_status !== "READY" || legacyCare.rows[0]?.path !== "legacy/private.pdf") throw new Error("Legacy care migration failed.");
  await database.query(`CREATE FUNCTION public.test_fail_document_ready() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.name = 'db-fail.pdf' AND NEW.status = 'READY' THEN RAISE EXCEPTION 'Simulated finalize failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_document_ready BEFORE UPDATE ON "Document" FOR EACH ROW EXECUTE FUNCTION public.test_fail_document_ready();`);
  const baseUrl = `http://localhost:${appPort}`;
  const env = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl,
    NEXT_PUBLIC_SUPABASE_URL: authUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "integration-test-only",
    CRON_SECRET: cronSecret, SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_STORAGE_BUCKET: "pet-documents",
    TEST_CRON_SECRET: cronSecret, TEST_STORAGE_URL: authUrl, TEST_SERVICE_KEY: serviceKey,
    APP_URL: "http://localhost:3000", PAWTRACK_INTEGRATION_TEST: "1", NEXT_TELEMETRY_DISABLED: "1",
    // The application never consumes these fixture identity variables.
    TEST_BASE_URL: baseUrl, TEST_TOKEN_A: tokenA, TEST_TOKEN_B: tokenB, TEST_OWNER_A: ownerA, TEST_OWNER_B: ownerB };
  await run(process.execPath, ["node_modules/prisma/build/index.js", "generate"], env);
  await run(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], env);
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(appPort)], { cwd: root, env, stdio: "inherit" });
  let ready = false;
  for (let attempt=0; attempt<100; attempt++) {
    if (app.exitCode !== null) throw new Error("Integration app exited unexpectedly.");
    try { if ((await fetch(`${baseUrl}/login`)).ok) { ready = true; break; } } catch { /* Wait for readiness. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Integration app did not become ready.");
  await run(process.execPath, ["--test", "tests/integration/api.test.mjs"], env);
} finally {
  if (app && app.exitCode === null) {
    app.kill("SIGTERM");
    await new Promise(resolve => app.once("exit", resolve));
  }
  await database?.end();
  if (postgresStarted) await run(join(pgBin, "pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"]);
  if (auth.listening) await new Promise(resolve => auth.close(resolve));
  // Next may add the isolated build's generated types to tsconfig; preserve user config.
  if (await readFile(tsconfigPath, "utf8") !== originalTsconfig) await writeFile(tsconfigPath, originalTsconfig);
  console.log(`Disposable PostgreSQL stopped. Test artifacts retained at ${directory}. No hosted database was contacted.`);
}
