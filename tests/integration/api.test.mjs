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
