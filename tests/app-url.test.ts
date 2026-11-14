import { test } from "node:test";
import assert from "node:assert/strict";
import { appOrigin } from "../src/lib/app-url";
test("Vercel Auth URLs fail closed without a canonical HTTPS origin", () => {
  assert.throws(() => appOrigin("",true));
  assert.throws(() => appOrigin("http://localhost:3000",true));
  assert.throws(() => appOrigin("http://example.com",true));
  assert.equal(appOrigin("https://pawtrack.example",true),"https://pawtrack.example");
  assert.equal(appOrigin("http://localhost:3000",false),"http://localhost:3000");
  for (const value of ["https://user:pass@example.com","https://example.com/path","https://example.com?next=evil","javascript:alert(1)"]) assert.throws(() => appOrigin(value,true));
});

test("serverless PostgreSQL config requires TLS and never includes credentials in errors", async () => {
  const { runtimeDatabaseUrl } = await import("../src/lib/database-config");
  assert.equal(runtimeDatabaseUrl("postgresql://fixture@localhost/postgres",false),"postgresql://fixture@localhost/postgres");
  assert.throws(()=>runtimeDatabaseUrl("postgresql://fixture@localhost/postgres",true),/TLS/);
  assert.throws(()=>runtimeDatabaseUrl("postgresql://fixture@db.example/postgres?sslmode=no-verify",true),/TLS/);
  assert.equal(runtimeDatabaseUrl("postgresql://fixture@db.example/postgres?sslmode=verify-full",true),"postgresql://fixture@db.example/postgres?sslmode=verify-full");
  assert.throws(()=>runtimeDatabaseUrl("invalid fixture value",true),error=>error instanceof Error && !error.message.includes("invalid fixture value"));
});

test("production Supabase origins require HTTPS and reject embedded credentials", async () => {
  const { supabaseUrl } = await import("../src/lib/supabase/config");
  assert.equal(supabaseUrl("https://project.supabase.co",true),"https://project.supabase.co");
  assert.equal(supabaseUrl("http://127.0.0.1:1234",false),"http://127.0.0.1:1234");
  for (const value of ["http://project.supabase.co","https://user:pass@project.supabase.co","https://project.supabase.co/storage"]) assert.throws(()=>supabaseUrl(value,true));
});
