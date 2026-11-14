import assert from "node:assert/strict";
import { test } from "node:test";
import { checkServerIdentity, createSecureContext, rootCertificates, type ConnectionOptions, type PeerCertificate } from "node:tls";
import { Client } from "pg";
import { runtimeDatabaseConfig } from "../src/lib/database-config";

// Public CA fixture from Node's trust store; no database connection or secrets.
const ca = rootCertificates[0];
const uri = "postgresql://fixture:encoded%40password@db.example:6543/postgres?sslmode=verify-full";

test("production fails closed without a valid PEM CA, without leaking configuration", () => {
  // Construct fake key markers so the repository secret scanner doesn't flag
  // this intentionally invalid input as a committed private key.
  const fakeKey = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ") + "\nfixture\n" + ["-----END", "PRIVATE", "KEY-----"].join(" ");
  for (const value of ["", " ", "not-a-certificate", "/tmp/root.crt", fakeKey, "-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----", ca + "\nprivate-fixture"]) {
    assert.throws(() => runtimeDatabaseConfig(uri, value, true), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /SUPABASE_DB_CA_CERT/);
      assert.ok(!error.message.includes("encoded") && !error.message.includes("fixture"));
      return true;
    });
  }
});

test("production requires verify-full regardless of the installed pg compatibility defaults", () => {
  for (const mode of ["", "disable", "prefer", "require", "verify-ca", "no-verify"]) {
    const url = new URL(uri);
    url.searchParams.set("sslmode", mode);
    assert.throws(() => runtimeDatabaseConfig(url.toString(), ca, true), /verify-full/);
  }
});

test("Vercel and standalone production both require the CA by default", () => {
  const previous = { VERCEL: process.env.VERCEL, NODE_ENV: process.env.NODE_ENV };
  try {
    for (const environment of [{ VERCEL: "1", NODE_ENV: "development" }, { VERCEL: "", NODE_ENV: "production" }]) {
      Object.assign(process.env, environment);
      assert.throws(() => runtimeDatabaseConfig(uri, ""), /SUPABASE_DB_CA_CERT is required/);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("CA accepts real, CRLF and escaped newlines, including certificate bundles", () => {
  for (const value of [ca, ca.replace(/\n/g, "\r\n"), ca.replace(/\n/g, "\\n"), ca.replace(/\n/g, "\\r\\n"), ca + "\n" + rootCertificates[1]]) {
    const config = runtimeDatabaseConfig(uri, value, true);
    const ssl = config.ssl as ConnectionOptions;
    assert.equal(ssl.rejectUnauthorized, true);
    assert.equal(ssl.checkServerIdentity, checkServerIdentity);
    assert.doesNotThrow(() => createSecureContext(ssl));
    assert.ok((ssl.ca as string).includes("-----BEGIN CERTIFICATE-----\n"));
  }
});

test("the installed pg parser retains our CA and full verification despite URI SSL options", () => {
  const config = runtimeDatabaseConfig(uri + "&ssl=0&sslrootcert=/does-not-exist&sslcert=/does-not-exist&sslkey=/does-not-exist&uselibpqcompat=true&sslnegotiation=direct&application_name=pawtrack", ca, true);
  const url = new URL(config.connectionString!);
  assert.deepEqual([...url.searchParams.keys()], ["application_name"]);
  const client = new Client(config);
  // @types/pg types this property as boolean, but pg exposes the effective object.
  const ssl = client.ssl as unknown as ConnectionOptions;
  assert.equal(ssl.ca, ca.trim() + "\n");
  assert.equal(ssl.rejectUnauthorized, true);
  assert.equal(ssl.checkServerIdentity, checkServerIdentity);
  assert.equal(client.host, "db.example");
  assert.equal(client.port, 6543);
  assert.equal(client.password, "encoded@password");
});

test("the configured hostname verifier rejects another host", () => {
  const ssl = runtimeDatabaseConfig(uri, ca, true).ssl as ConnectionOptions;
  const certificate = { subject: { CN: "db.example" }, subjectaltname: "DNS:db.example" } as PeerCertificate;
  assert.equal(ssl.checkServerIdentity!("db.example", certificate), undefined);
  assert.match(ssl.checkServerIdentity!("attacker.example", certificate)!.message, /does not match/);
});

test("local PostgreSQL fixtures may omit TLS; a supplied local CA still enforces verification", () => {
  assert.deepEqual(runtimeDatabaseConfig("postgresql://fixture@localhost/postgres", "", false), { connectionString: "postgresql://fixture@localhost/postgres" });
  const ssl = runtimeDatabaseConfig(uri, ca, false).ssl as ConnectionOptions;
  assert.equal(ssl.rejectUnauthorized, true);
  assert.equal(ssl.checkServerIdentity, checkServerIdentity);
});
