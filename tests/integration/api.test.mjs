import { test } from "node:test";
import assert from "node:assert/strict";

// This file is launched only by the isolated runner. It accepts no database URL.
const base = process.env.TEST_BASE_URL;
assert.ok(base?.startsWith("http://localhost:"), "Use npm run test:integration, not a hosted app.");
const tokens = { a: process.env.TEST_TOKEN_A, b: process.env.TEST_TOKEN_B };
function cookieValue(value) { return `base64-${Buffer.from(JSON.stringify(value)).toString("base64url")}`; }
function sessionCookie(token) {
  return `sb-127-auth-token=${cookieValue({ access_token: token, refresh_token: "fixture-refresh", expires_at: Math.floor(Date.now()/1000)+3600, token_type: "bearer", user: { id: "untrusted-cookie-user" } })}`;
}
async function api(method, path, identity, body, extra = {}) {
  return fetch(`${base}${path}`, { method, redirect: "manual", headers: {
    ...(identity ? { Cookie: sessionCookie(tokens[identity] || identity) } : {}),
    Origin: base, ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...extra,
  }, ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
}
async function pet(response) { assert.ok(response.ok, `Expected success, received ${response.status}: ${await response.clone().text()}`); return (await response.json()).pet; }

await test("pet API authorization over HTTP with real isolated PostgreSQL", async t => {
  let a; let b;
  await t.test("creates profiles for two verified owners, ignoring the untrusted cookie user", async () => {
    a = await pet(await api("POST", "/api/pets", "a", { name: "Fixture A", species: "Dog", weight: 12.5 }));
    b = await pet(await api("POST", "/api/pets", "b", { name: "Fixture B", species: "Cat" }));
    assert.notEqual(a.id, b.id);
    assert.equal("ownerId" in a, false);
  });
  await t.test("lists are scoped even when a client supplies another owner as a query parameter", async () => {
    for (const [identity, own, foreign] of [["a", a, b], ["b", b, a]]) {
      const response = await api("GET", `/api/pets?ownerId=${process.env.TEST_OWNER_A}`, identity);
      assert.equal(response.status, 200);
      const { pets } = await response.json();
      assert.deepEqual(pets.map(p => p.id), [own.id]);
      assert.equal(pets.some(p => p.id === foreign.id), false);
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
  });
  await t.test("direct GET, PUT, and DELETE of a foreign pet return 404 in both directions", async () => {
    for (const [identity, foreign] of [["a", b], ["b", a]]) {
      for (const method of ["GET", "PUT", "DELETE"]) {
        const response = await api(method, `/api/pets/${foreign.id}`, identity, method === "PUT" ? { name: "Unauthorized edit", species: "Other" } : undefined);
        assert.equal(response.status, 404, `${identity} ${method} foreign pet`);
        assert.deepEqual(await response.json(), { error: "Pet not found." });
      }
    }
    assert.deepEqual(await pet(await api("GET", `/api/pets/${a.id}`, "a")), a);
    assert.deepEqual(await pet(await api("GET", `/api/pets/${b.id}`, "b")), b);
  });
  await t.test("unknown and foreign IDs are indistinguishable", async () => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const body = method === "PUT" ? { name: "Attempt", species: "Dog" } : undefined;
      const missing = await api(method, "/api/pets/99999999-9999-4999-8999-999999999999", "b", body);
      const foreign = await api(method, `/api/pets/${a.id}`, "b", body);
      assert.equal(missing.status, foreign.status);
      assert.deepEqual(await missing.json(), await foreign.json());
    }
  });
  await t.test("all protected methods reject missing and forged sessions before touching data", async () => {
    const forged = tokens.a.split(".");
    forged[1] = Buffer.from(JSON.stringify({ sub: process.env.TEST_OWNER_B, exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url");
    for (const identity of [undefined, forged.join(".")]) {
      for (const [method, path] of [["GET", "/api/pets"], ["POST", "/api/pets"], ["GET", `/api/pets/${a.id}`], ["PUT", `/api/pets/${a.id}`], ["DELETE", `/api/pets/${a.id}`]]) {
        const response = await api(method, path, identity, ["POST", "PUT"].includes(method) ? { name: "No session", species: "Dog" } : undefined);
        assert.equal(response.status, 401, `${method} ${path}`);
      }
    }
    const noOrigin = await fetch(`${base}/api/pets/${a.id}`, { method: "DELETE" });
    assert.equal(noOrigin.status, 401);
    assert.deepEqual(await pet(await api("GET", `/api/pets/${a.id}`, "a")), a);
  });
  await t.test("forged ownership fields fail server validation", async () => {
    for (const [method, path] of [["POST", "/api/pets"], ["PUT", `/api/pets/${a.id}`]]) {
      const response = await api(method, path, "a", { name: "Attempt", species: "Dog", ownerId: process.env.TEST_OWNER_B });
      assert.equal(response.status, 422);
    }
  });
  await t.test("writes reject cross-origin requests, invalid media types, and oversized bodies", async () => {
    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = await api(method, method === "POST" ? "/api/pets" : `/api/pets/${a.id}`, "a", method === "DELETE" ? undefined : { name: "Attempt", species: "Dog" }, { Origin: "https://evil.example" });
      assert.equal(response.status, 403);
    }
    assert.equal((await api("POST", "/api/pets", "a", { name: "Attempt", species: "Dog" }, { "Content-Type": "text/plain; application/json" })).status, 415);
    assert.equal((await api("POST", "/api/pets", "a", "{")).status, 400);
    assert.equal((await api("POST", "/api/pets", "a", { name: "x".repeat(17000), species: "Dog" })).status, 413);
  });
  await t.test("owners can read, update, and delete their own persisted records", async () => {
    const updated = await pet(await api("PUT", `/api/pets/${a.id}`, "a", { name: "Updated fixture", species: "Dog", weight: 13.25 }));
    assert.equal(updated.name, "Updated fixture");
    assert.deepEqual(await pet(await api("GET", `/api/pets/${a.id}`, "a")), updated);
    assert.equal((await api("DELETE", `/api/pets/${a.id}`, "a")).status, 204);
    assert.equal((await api("GET", `/api/pets/${a.id}`, "a")).status, 404);
    assert.deepEqual(await pet(await api("GET", `/api/pets/${b.id}`, "b")), b);
  });
});

await test("auth callbacks over HTTP with the installed Supabase PKCE cookie implementation", async t => {
  function verifierCookie(recovery) {
    return `sb-127-auth-token-flow-fixtureflow123-code-verifier=${cookieValue(`integration-verifier${recovery ? "/recovery" : ""}`)}`;
  }
  await t.test("invalid callbacks fail closed, avoid external redirects, and protect auth responses", async () => {
    for (const [route, destination] of [["/auth/callback", "/login?error=confirmation"], ["/auth/recovery", "/forgot-password?error=recovery"]]) {
      for (const query of ["", "?error=access_denied&code=ignored", "?code=invalid&next=https://evil.example", "?code=invalid&sb_flow_id=missingflow123"]) {
        const response = await fetch(`${base}${route}${query}`, { redirect: "manual" });
        assert.equal(response.status, 307);
        assert.equal(response.headers.get("location"), `${base}${destination}`);
        assert.match(response.headers.get("cache-control"), /no-store/);
        assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      }
    }
  });
  await t.test("signup and recovery honor the matching flow cookie and preserve the session", async () => {
    for (const [route, code, recovery, destination] of [["/auth/callback", "signup-code", false, "/dashboard"], ["/auth/recovery", "recovery-code", true, "/reset-password"], ["/auth/callback", "callback-recovery-code", true, "/reset-password"]]) {
      const response = await fetch(`${base}${route}?code=${code}&sb_flow_id=fixtureflow123&next=https://evil.example`, { redirect: "manual", headers: { Cookie: verifierCookie(recovery) } });
      assert.equal(response.headers.get("location"), `${base}${destination}`);
      assert.ok(response.headers.getSetCookie().some(value => value.startsWith("sb-127-auth-token=")), "Callback must persist the exchanged session");
      const reused = await fetch(`${base}${route}?code=${code}&sb_flow_id=fixtureflow123`, { redirect: "manual", headers: { Cookie: verifierCookie(recovery) } });
      assert.match(reused.headers.get("location"), /error=/);
    }
  });
  await t.test("signed-out reset pages require recovery and invalid links cannot rely on an existing session", async () => {
    const response = await api("GET", "/reset-password");
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "/forgot-password?error=recovery");
    const invalid = await api("GET", "/auth/recovery?code=invalid", "a");
    assert.equal(invalid.headers.get("location"), `${base}/forgot-password?error=recovery`);
  });
});

await test("health record CRUD and isolation over HTTP", async t => {
  const a = await pet(await api("POST", "/api/pets", "a", { name: "Health fixture A", species: "Dog", weight: 5 }));
  const b = await pet(await api("POST", "/api/pets", "b", { name: "Health fixture B", species: "Cat" }));
  const sibling = await pet(await api("POST", "/api/pets", "a", { name: "Health sibling", species: "Dog" }));
  const fixtures = {
    weights: { weightKg: 10.25, recordedAt: "2025-01-02", notes: "Morning" },
    vaccinations: { name: "Rabies", administeredAt: "2025-01-02", nextDueAt: "2026-01-02", notes: "Annual" },
    "vet-visits": { visitedAt: "2025-01-02", clinic: "Paw Clinic", reason: "Annual exam", notes: "Routine" },
    medications: { name: "Prescription", dosage: "1 tablet", frequency: "Daily", startsAt: "2025-01-02", endsAt: null, notes: "With food" },
  };
  for (const [resource, body] of Object.entries(fixtures)) {
    await t.test(`${resource}: full CRUD, validation, authentication and parent ownership`, async () => {
      const path = `/api/pets/${a.id}/${resource}`;
      const created = await api("POST", path, "a", body);
      assert.equal(created.status, 201);
      const record = (await created.json()).record;
      assert.equal(record.petId, a.id);
      assert.equal(record.kind, resource);
      const item = `${path}/${record.id}`;
      assert.deepEqual((await (await api("GET", item, "a")).json()).record, record);
      assert.deepEqual((await (await api("GET", path, "a")).json()).records, [record]);
      for (const method of ["GET", "PUT", "DELETE"]) {
        assert.equal((await api(method, item, "b", method === "PUT" ? body : undefined)).status, 404, `${method} foreign record`);
        assert.equal((await api(method, `/api/pets/${b.id}/${resource}/${record.id}`, "b", method === "PUT" ? body : undefined)).status, 404, `${method} foreign record under own pet`);
        assert.equal((await api(method, `/api/pets/${sibling.id}/${resource}/${record.id}`, "a", method === "PUT" ? body : undefined)).status, 404, `${method} record under wrong same-owner pet`);
      }
      assert.equal((await api("GET", path, "b")).status, 404);
      assert.equal((await api("POST", path, "b", body)).status, 404);
      for (const identity of [undefined, "forged.jwt.token"]) {
        for (const [method, url] of [["GET", path], ["POST", path], ["GET", item], ["PUT", item], ["DELETE", item]]) {
          assert.equal((await api(method, url, identity, ["PUT", "POST"].includes(method) ? body : undefined)).status, 401);
        }
      }
      assert.deepEqual((await (await api("GET", item, "a")).json()).record, record, "Denied writes must not change stored data");
      for (const method of ["POST", "PUT"]) {
        for (const extra of [{ petId: b.id }, { ownerId: process.env.TEST_OWNER_B }, { notes: "x".repeat(4001) }]) assert.equal((await api(method, method === "POST" ? path : item, "a", { ...body, ...extra })).status, 422);
        assert.equal((await api(method, method === "POST" ? path : item, "a", {})).status, 422);
      }
      const updatedBody = { ...body, notes: "Updated note", ...(resource === "weights" ? { weightKg: 11.5 } : resource === "vet-visits" ? { reason: "Follow-up" } : { name: "Updated name" }) };
      assert.equal((await api("PUT", item, "a", updatedBody)).status, 200);
      const updated = (await (await api("GET", item, "a")).json()).record;
      assert.equal(updated.notes, "Updated note");
      const invalidDates = resource === "weights" ? { recordedAt: "2999-01-01" } : resource === "vaccinations" ? { nextDueAt: "2024-01-01" } : resource === "vet-visits" ? { visitedAt: "2025-02-30" } : { endsAt: "2024-01-01" };
      assert.equal((await api("POST", path, "a", { ...body, ...invalidDates })).status, 422);
      assert.equal((await api("POST", path, "a", body, { Origin: "https://evil.example" })).status, 403);
      assert.equal((await api("GET", `${path}/invalid-id`, "a")).status, 400);
      if (resource !== "weights") {
        const dateField = resource === "vaccinations" ? "administeredAt" : resource === "vet-visits" ? "visitedAt" : "startsAt";
        const older = await api("POST", path, "a", { ...body, [dateField]: "2024-01-01" });
        assert.equal(older.status, 201);
        const olderId = (await older.json()).record.id;
        assert.deepEqual((await (await api("GET", path, "a")).json()).records.map(record => record.id), [record.id, olderId], "Newest dated record comes first");
        assert.equal((await api("DELETE", `${path}/${olderId}`, "a")).status, 204);
      }
      if (resource === "weights") {
        assert.equal((await pet(await api("GET", `/api/pets/${a.id}`, "a"))).latestWeight, "11.5");
        const older = await api("POST", path, "a", { weightKg: 9, recordedAt: "2024-01-01" });
        assert.equal(older.status, 201);
        assert.equal((await pet(await api("GET", `/api/pets/${a.id}`, "a"))).latestWeight, "11.5", "Backdated records cannot replace latest");
        const olderId = (await older.json()).record.id;
        assert.equal((await api("DELETE", `${path}/${olderId}`, "a")).status, 204);
      }
      assert.equal((await api("DELETE", item, "a")).status, 204);
      assert.equal((await api("GET", item, "a")).status, 404);
      assert.deepEqual((await (await api("GET", path, "a")).json()).records, []);
      if (resource === "weights") assert.equal((await pet(await api("GET", `/api/pets/${a.id}`, "a"))).latestWeight, "5", "Falls back to preserved profile weight");
    });
  }
  await t.test("health pages and pet profiles are guarded against direct cross-account access", async () => {
    const foreignPage = await api("GET", `/pets/${a.id}`, "b");
    assert.ok([200, 404].includes(foreignPage.status));
    const deniedHtml = await foreignPage.text();
    // Next's loading boundary may already have streamed a 200 shell before notFound().
    assert.match(deniedHtml, /This page wandered off/);
    assert.match(deniedHtml, /noindex/);
    assert.equal(deniedHtml.includes("Health fixture A"), false);
    for (const [resource, body] of Object.entries(fixtures)) assert.equal((await api("POST", `/api/pets/${a.id}/${resource}`, "a", body)).status, 201);
    for (const path of [`/pets/${a.id}`, "/health-records", "/medications", "/dashboard"]) {
      const signedOut = await api("GET", path);
      assert.ok([200,307].includes(signedOut.status));
      if (signedOut.status === 307) assert.match(signedOut.headers.get("location"), /\/login/);
      else {
        const html = await signedOut.text();
        assert.match(html, /NEXT_REDIRECT.*?\/login/);
        assert.equal(html.includes("Health fixture A"), false);
      }
      const signedIn = await api("GET", path, "a");
      assert.equal(signedIn.status, 200);
      const html = await signedIn.text();
      assert.match(html, /Health fixture A/);
      assert.equal(html.includes("Health fixture B"), false);
    }
  });
  for (const profile of [a,b,sibling]) assert.equal((await api("DELETE", `/api/pets/${profile.id}`, profile.id === b.id ? "b" : "a")).status, 204);
});

async function cron(secret = process.env.TEST_CRON_SECRET) {
  return fetch(`${base}/api/cron/process-reminders`, { headers: secret ? { Authorization: `Bearer ${secret}` } : {}, redirect: "manual" });
}
await test("persistent reminders and idempotent scheduled processing", async t => {
  const a = await pet(await api("POST", "/api/pets", "a", { name: "Reminder pet", species: "Dog" }));
  const b = await pet(await api("POST", "/api/pets", "b", { name: "Other reminder pet", species: "Cat" }));
  const today = new Date().toISOString().slice(0,10);
  const tomorrow = new Date(Date.parse(today)+86400000).toISOString().slice(0,10);
  let automatic; let vaccine;
  await t.test("vaccination writes create one reminder and cron requires its secret", async () => {
    vaccine = (await (await api("POST", `/api/pets/${a.id}/vaccinations`, "a", { name: "Reminder vaccine", administeredAt: "2020-01-01", nextDueAt: today })).json()).record;
    const reminders = (await (await api("GET", `/api/pets/${a.id}/reminders`, "a")).json()).reminders;
    assert.equal(reminders.length, 1); automatic = reminders[0];
    assert.equal(automatic.source, "VACCINATION");
    assert.equal((await cron("")).status, 401);
    assert.equal((await cron("invalid-secret")).status, 401);
    const first = await cron(); assert.equal(first.status, 200);
    const processed = (await (await api("GET", `/api/pets/${a.id}/reminders/${automatic.id}`, "a")).json()).reminder;
    assert.ok(processed.processedAt);
    for (const response of await Promise.all([cron(), cron()])) assert.equal(response.status, 200);
    const again = (await (await api("GET", `/api/pets/${a.id}/reminders`, "a")).json()).reminders;
    assert.equal(again.length, 1); assert.equal(again[0].processedAt, processed.processedAt);
  });
  await t.test("manual reminders are isolated and terminal states survive repeated jobs", async () => {
    const path = `/api/pets/${a.id}/reminders`;
    const body = { title: "Vet appointment", category: "VET_APPOINTMENT", dueAt: today };
    const created = await api("POST", path, "a", body); assert.equal(created.status, 201);
    const manual = (await created.json()).reminder;
    for (const [method, url, payload] of [["GET", path], ["POST", path, body], ["GET", `${path}/${manual.id}`], ["PATCH", `${path}/${manual.id}`, { status: "DISMISSED" }]]) {
      assert.equal((await api(method, url, "b", payload)).status, 404);
      assert.equal((await api(method, url, undefined, payload)).status, 401);
    }
    assert.equal((await api("PATCH", `/api/pets/${b.id}/reminders/${manual.id}`, "b", { status: "COMPLETED" })).status, 404);
    assert.equal((await api("POST", path, "a", { ...body, ownerId: process.env.TEST_OWNER_B })).status, 422);
    assert.equal((await api("POST", path, "a", { ...body, dueAt: "2026-02-30" })).status, 422);
    const finished = (await (await api("PATCH", `${path}/${automatic.id}`, "a", { status: "COMPLETED" })).json()).reminder;
    assert.ok(finished.completedAt);
    assert.equal((await api("PATCH", `${path}/${manual.id}`, "a", { status: "DISMISSED" })).status, 200);
    await cron(); await cron();
    const records = (await (await api("GET", path, "a")).json()).reminders;
    assert.equal(records.find(r => r.id === automatic.id).status, "COMPLETED");
    assert.equal(records.find(r => r.id === automatic.id).completedAt, finished.completedAt);
    assert.equal(records.find(r => r.id === manual.id).status, "DISMISSED");
    assert.equal((await (await api("GET", "/api/reminders?ownerId=forged", "b")).json()).reminders.some(r => r.petId === a.id), false);
    assert.equal((await api("GET", "/api/reminders")).status, 401);
  });
  await t.test("changed due dates create a new key, old pending reminders dismiss, deletion preserves history", async () => {
    const path = `/api/pets/${a.id}/vaccinations/${vaccine.id}`;
    assert.equal((await api("PUT", path, "a", { name: "Changed vaccine", administeredAt: "2020-01-01", nextDueAt: tomorrow })).status, 200);
    let records = (await (await api("GET", `/api/pets/${a.id}/reminders`, "a")).json()).reminders;
    assert.equal(records.filter(r => r.source === "VACCINATION").length, 2);
    const newReminder = records.find(r => r.dueAt === tomorrow);
    assert.ok(newReminder); assert.equal(newReminder.status, "PENDING");
    assert.equal((await api("PUT", path, "a", { name: "Changed vaccine", administeredAt: "2020-01-01", nextDueAt: null })).status, 200);
    await cron();
    records = (await (await api("GET", `/api/pets/${a.id}/reminders`, "a")).json()).reminders;
    assert.equal(records.find(r => r.id === newReminder.id).status, "DISMISSED");
    assert.equal((await api("DELETE", path, "a")).status, 204);
    assert.equal((await api("GET", "/reminders", "a")).status, 200);
  });
  await api("DELETE", `/api/pets/${a.id}`, "a"); await api("DELETE", `/api/pets/${b.id}`, "b");
});

async function storageStats() {
  return (await fetch(`${process.env.TEST_STORAGE_URL}/test-storage-stats`, { headers: { Authorization: `Bearer ${process.env.TEST_SERVICE_KEY}` } })).json();
}
async function expireUploads() {
  const response = await fetch(`${process.env.TEST_STORAGE_URL}/test-storage-expire`, { headers: { Authorization: `Bearer ${process.env.TEST_SERVICE_KEY}` } });
  assert.equal(response.status,200);
}
async function reserve(petId, identity, name, mimeType, sizeBytes, extra = {}) {
  return api("POST",`/api/pets/${petId}/documents`,identity,{name,mimeType,sizeBytes,...extra});
}
async function upload(petId, identity, bytes, name = "report.pdf", mime = "application/pdf", extra) {
  const reservation = await reserve(petId,identity,name,mime,bytes.length,extra ? {ownerId:"forged"} : {});
  if (!reservation.ok) return reservation;
  const {upload} = await reservation.json();
  const sent = await fetch(upload.url,{method:"PUT",headers:{"Content-Type":mime,"x-upsert":"false"},body:bytes});
  if (!sent.ok) { await api("DELETE",`/api/pets/${petId}/documents/${upload.documentId}`,identity); return sent; }
  return api("POST",`/api/pets/${petId}/documents/${upload.documentId}/complete`,identity,{});
}

await test("private medical documents and recoverable Storage failures", async t => {
  const a = await pet(await api("POST", "/api/pets", "a", { name: "Document pet", species: "Dog" }));
  const b = await pet(await api("POST", "/api/pets", "b", { name: "Other document pet", species: "Cat" }));
  const pdf = new TextEncoder().encode("%PDF-1.7\nPrivate medical fixture"); let document;
  await t.test("uploads privately with non-guessable paths and authorizes list/preview/download/delete", async () => {
    const response = await upload(a.id, "a", pdf); assert.equal(response.status, 201);
    document = (await response.json()).document;
    const repeated = await api("POST", `/api/pets/${a.id}/documents/${document.id}/complete`,"a",{});
    assert.equal(repeated.status,201); assert.deepEqual((await repeated.json()).document,document);
    assert.equal(document.sizeBytes, pdf.length); assert.equal("storagePath" in document, false);
    const path = `/api/pets/${a.id}/documents/${document.id}`;
    assert.equal((await api("GET", `/api/pets/${a.id}/documents`, "a")).status, 200);
    for (const [method,url] of [["GET",path], ["GET",`${path}?download=1`], ["DELETE",path], ["GET",`/api/pets/${a.id}/documents`]]) {
      assert.equal((await api(method,url,"b")).status, 404);
      assert.equal((await api(method,url)).status, 401);
    }
    assert.equal((await upload(a.id,"b",pdf)).status, 404);
    assert.equal((await upload(a.id,undefined,pdf)).status, 401);
    assert.equal((await api("GET", `/api/pets/${b.id}/documents/${document.id}`, "b")).status, 404);
    assert.equal((await api("GET", "/api/documents")).status, 401);
    assert.equal((await api("POST", `${path}/complete`, "b", {})).status,404);
    assert.equal((await api("POST", `${path}/complete`, undefined, {})).status,401);
    assert.deepEqual((await (await api("GET", "/api/documents", "b")).json()).documents, []);
    const signedResponse = await api("GET", path, "a"); const signed = await signedResponse.json();
    assert.equal(signed.expiresIn, 60); assert.match(signedResponse.headers.get("cache-control"), /no-store/);
    const signedUrl = new URL(signed.url); assert.match(signedUrl.pathname, new RegExp(`${process.env.TEST_OWNER_A}/${a.id}/[0-9a-f-]+\\.pdf`));
    const preview = await fetch(signed.url); assert.equal(preview.status, 200); assert.deepEqual(new Uint8Array(await preview.arrayBuffer()), pdf);
    const download = await api("GET", `${path}?download=1`, "a"); assert.equal(download.status, 200); assert.match((await download.json()).url, /download=/);
    const privatePath = signed.url.split("?")[0].replace("/object/sign/", "/object/authenticated/");
    assert.equal((await fetch(privatePath,{headers:{Authorization:`Bearer ${tokens.b}`}})).status,403);
    assert.equal((await fetch(privatePath,{headers:{Authorization:`Bearer ${tokens.a}`}})).status,200);
    const publicPath = signed.url.replace("/object/sign/", "/object/public/"); assert.equal((await fetch(publicPath)).status, 403);
    const listed = (await (await api("GET", "/api/documents", "a")).json()).documents;
    assert.equal(listed.some(record => record.id === document.id), true);
  });
  await t.test("invalid, spoofed, oversized and forged-parent uploads do not reach Storage", async () => {
    const before = (await storageStats()).count;
    assert.equal((await upload(a.id,"a",pdf,"spoof.png","image/png")).status, 422);
    assert.equal((await upload(a.id,"a",new TextEncoder().encode("<svg/>"),"bad.svg","image/svg+xml")).status, 422);
    assert.equal((await upload(a.id,"a",new Uint8Array(),"empty.pdf")).status, 422);
    assert.equal((await upload(a.id,"a",pdf,"report.pdf","application/pdf",true)).status, 422);
    const huge = new Uint8Array(10*1024*1024+1); huge.set(pdf);
    assert.equal((await upload(a.id,"a",huge,"large.pdf")).status, 422);
    await expireUploads(); await cron();
    assert.equal((await storageStats()).count, before);
  });
  await t.test("exactly 10 MB and the other allowed signatures are supported", async () => {
    const full = new Uint8Array(10*1024*1024); full.set(pdf);
    const large = await upload(a.id,"a",full,"full.pdf"); assert.equal(large.status, 201);
    const largeDoc = (await large.json()).document;
    assert.equal((await api("DELETE",`/api/pets/${a.id}/documents/${largeDoc.id}`,"a")).status,200);
    for (const [bytes,name,mime] of [[new Uint8Array([255,216,255,0]),"image.jpg","image/jpeg"], [new Uint8Array([137,80,78,71,13,10,26,10]),"image.png","image/png"], [new TextEncoder().encode("RIFF1234WEBP"),"image.webp","image/webp"]]) {
      const created = await upload(a.id,"a",bytes,name,mime); assert.equal(created.status,201);
      const record = (await created.json()).document;
      assert.equal((await api("DELETE",`/api/pets/${a.id}/documents/${record.id}`,"a")).status,200);
    }
  });
  await t.test("uncertain failed uploads, database-finalize failures, and failed deletes recover via cron", async () => {
    const before = (await storageStats()).count;
    const uncertain = await upload(a.id,"a",new TextEncoder().encode("%PDF-1.7 FAIL_UPLOAD FAIL_DELETE_ONCE"),"uncertain.pdf"); assert.equal(uncertain.status,500);
    assert.equal((await storageStats()).count,before+1);
    await expireUploads();
    const job = await cron(); assert.equal(job.status,200); assert.ok((await job.json()).cleanup.failed >= 1);
    await expireUploads(); await cron();
    assert.equal((await storageStats()).count,before);
    const dbFail = await upload(a.id,"a",pdf,"db-fail.pdf"); assert.equal(dbFail.status,502); assert.equal((await storageStats()).count,before);
    const failedDelete = await upload(a.id,"a",new TextEncoder().encode("%PDF-1.7 FAIL_DELETE_ONCE"),"retry.pdf"); assert.equal(failedDelete.status,201);
    const record = (await failedDelete.json()).document; const path=`/api/pets/${a.id}/documents/${record.id}`;
    assert.equal((await api("DELETE",path,"a")).status,202);
    assert.equal((await api("GET",path,"a")).status,404);
    assert.equal((await (await api("GET","/api/documents","a")).json()).documents.some(r=>r.id===record.id),false);
    await expireUploads(); await cron(); assert.equal((await storageStats()).count,before);
  });
  await t.test("staging grants are scoped and cannot alter published documents", async () => {
    const reservation=await reserve(a.id,"a","immutable.pdf","application/pdf",pdf.length);
    assert.equal(reservation.status,201); const {upload:grant}=await reservation.json();
    const stageUrl=new URL(grant.url);
    const finalPath=stageUrl.pathname.replace("/object/upload/sign/","/object/").replace("/staging/","/");
    const finalUploadUrl=`${stageUrl.origin}${finalPath}`;
    assert.equal((await fetch(finalUploadUrl,{method:"POST",headers:{Authorization:`Bearer ${tokens.a}`,"Content-Type":"application/pdf"},body:pdf})).status,403);
    const foreignGrantUrl=grant.url.replace(a.id,b.id);
    assert.equal((await fetch(foreignGrantUrl,{method:"PUT",headers:{"Content-Type":"application/pdf"},body:pdf})).status,403);
    assert.equal((await api("POST",`/api/pets/${a.id}/documents/${grant.documentId}/complete`,"b",{})).status,404);
    assert.equal((await api("POST",`/api/pets/${a.id}/documents/${grant.documentId}/complete`,undefined,{})).status,401);
    assert.equal((await api("POST",`/api/pets/${a.id}/documents/${grant.documentId}/complete`,"a",{path:"forged"})).status,422);
    assert.equal((await fetch(grant.url,{method:"PUT",headers:{"Content-Type":"application/pdf"},body:pdf})).status,200);
    const stageRead=`${stageUrl.origin}${stageUrl.pathname.replace("/object/upload/sign/","/object/authenticated/")}`;
    assert.equal((await fetch(stageRead,{headers:{Authorization:`Bearer ${tokens.a}`}})).status,403);
    const item=`/api/pets/${a.id}/documents/${grant.documentId}`;
    assert.equal((await api("GET",item,"a")).status,404);
    const completions=await Promise.all([api("POST",`${item}/complete`,"a",{}),api("POST",`${item}/complete`,"a",{})]);
    assert.ok(completions.some(response=>response.status===201));
    assert.ok(completions.every(response=>[201,409].includes(response.status)));
    // A still-valid staging grant can be replayed after its old object was removed.
    // It must remain unable to affect the independently validated final byte snapshot.
    assert.equal((await fetch(grant.url,{method:"PUT",headers:{"Content-Type":"text/html","x-upsert":"true"},body:"<script>untrusted</script>"})).status,200);
    const signed=await (await api("GET",item,"a")).json();
    assert.deepEqual(new Uint8Array(await (await fetch(signed.url)).arrayBuffer()),pdf);
    assert.equal((await api("POST",`${item}/complete`,"a",{})).status,201);
    const finalGrant=`${stageUrl.origin}${stageUrl.pathname.replace("/staging/","/")}`;
    assert.equal((await fetch(finalGrant,{method:"POST",headers:{Authorization:`Bearer ${tokens.a}`,"Content-Type":"application/json"},body:"{}"})).status,403);
    await api("DELETE",item,"a"); await expireUploads(); await cron();
  });
  await t.test("abandoned reservations and size-mismatched direct uploads never become READY", async () => {
    const abandoned=await reserve(a.id,"a","abandoned.pdf","application/pdf",pdf.length);
    assert.equal(abandoned.status,201); const {upload:grant}=await abandoned.json();
    const item=`/api/pets/${a.id}/documents/${grant.documentId}`;
    assert.equal((await api("GET",item,"a")).status,404);
    await expireUploads();
    assert.equal((await api("POST",`${item}/complete`,"a",{})).status,409);
    await cron();
    assert.equal((await api("POST",`${item}/complete`,"a",{})).status,404);
    assert.equal((await fetch(grant.url,{method:"PUT",headers:{"Content-Type":"application/pdf"},body:pdf})).status,403);
    const mismatch=await reserve(a.id,"a","mismatch.pdf","application/pdf",pdf.length+1);
    const {upload:other}=await mismatch.json();
    assert.equal((await fetch(other.url,{method:"PUT",headers:{"Content-Type":"application/pdf"},body:pdf})).status,200);
    assert.equal((await api("POST",`/api/pets/${a.id}/documents/${other.documentId}/complete`,"a",{})).status,422);
    assert.equal((await api("GET",`/api/pets/${a.id}/documents/${other.documentId}`,"a")).status,404);
    await expireUploads(); await cron();
  });
  await t.test("document inventory survives pet deletion and the worker removes orphaned objects", async () => {
    assert.equal((await api("GET","/documents","a")).status,200);
    assert.equal((await api("DELETE",`/api/pets/${a.id}`,"a")).status,204);
    assert.equal((await api("GET",`/api/pets/${a.id}/documents/${document.id}`,"a")).status,404);
    await expireUploads();
    const job=await cron(); assert.equal(job.status,200);
    assert.equal((await storageStats()).count,0);
    const repeat=await cron(); assert.equal(repeat.status,200);
  });
  await api("DELETE",`/api/pets/${b.id}`,"b");
});
