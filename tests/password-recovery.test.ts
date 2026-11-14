import { test } from "node:test";
import assert from "node:assert/strict";
import { recoveryEmailSchema, newPasswordSchema, recoveryRedirectUrl, sendRecoveryEmail, completeRecovery, updateRecoveredPassword } from "../src/lib/password-recovery";

type Auth = Parameters<typeof completeRecovery>[0];
function fakeAuth(overrides: Record<string, unknown> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const auth = Object.fromEntries(Object.entries({
    resetPasswordForEmail: { data: {}, error: null },
    exchangeCodeForSession: { data: { user: { id: "owner-a" }, session: {}, redirectType: "recovery" }, error: null },
    getUser: { data: { user: { id: "owner-a" } }, error: null },
    updateUser: { data: { user: { id: "owner-a" } }, error: null },
    signOut: { error: null }, ...overrides,
  }).map(([method, result]) => [method, async (...args: unknown[]) => { calls.push({ method, args }); if (result instanceof Error) throw result; return result; }])) as unknown as Auth;
  return { auth, calls };
}

test("validates recovery addresses and matching password bounds on the server", () => {
  assert.equal(recoveryEmailSchema.parse(" parent@example.com "), "parent@example.com");
  assert.equal(recoveryEmailSchema.safeParse("invalid").success, false);
  for (const password of ["short", "x".repeat(129)]) assert.equal(newPasswordSchema.safeParse({ password, confirmPassword: password }).success, false);
  assert.equal(newPasswordSchema.safeParse({ password: "secure-pass", confirmPassword: "different-pass" }).success, false);
  assert.equal(newPasswordSchema.safeParse({ password: "secure-pass", confirmPassword: "secure-pass" }).success, true);
});

test("constructs a fixed localhost callback and rejects unsafe configuration", () => {
  assert.equal(recoveryRedirectUrl("http://localhost:3000"), "http://localhost:3000/auth/recovery");
  assert.equal(recoveryRedirectUrl("https://pawtrack.example"), "https://pawtrack.example/auth/recovery");
  for (const value of ["http://example.com", "javascript:alert(1)", "https://user:password@example.com", "https://example.com/evil", "https://example.com?next=evil"]) assert.throws(() => recoveryRedirectUrl(value));
});

test("sends the recovery request with a fixed callback and does not disclose account existence", async () => {
  const valid = fakeAuth();
  const success = await sendRecoveryEmail(valid.auth, "parent@example.com", recoveryRedirectUrl("http://localhost:3000"));
  assert.deepEqual(valid.calls[0], { method: "resetPasswordForEmail", args: ["parent@example.com", { redirectTo: "http://localhost:3000/auth/recovery" }] });
  const unknown = fakeAuth({ resetPasswordForEmail: { error: { status: 400, message: "Account not found" } } });
  assert.deepEqual(await sendRecoveryEmail(unknown.auth, "unknown@example.com", recoveryRedirectUrl("http://localhost:3000")), success);
});

test("handles recovery throttling and network failures", async () => {
  const throttled = fakeAuth({ resetPasswordForEmail: { error: { status: 429 } } });
  assert.match((await sendRecoveryEmail(throttled.auth, "a@example.com", recoveryRedirectUrl("http://localhost:3000"))).error!, /Too many/);
  const offline = fakeAuth({ resetPasswordForEmail: new Error("network") });
  assert.match((await sendRecoveryEmail(offline.auth, "a@example.com", recoveryRedirectUrl("http://localhost:3000"))).error!, /connect/);
});

test("exchanges recovery codes with flow IDs and ignores arbitrary redirect destinations", async () => {
  const { auth, calls } = fakeAuth();
  assert.equal(await completeRecovery(auth, new URLSearchParams({ code: "valid", sb_flow_id: "test-flow", next: "https://evil.example" })), "/reset-password");
  assert.deepEqual(calls[0], { method: "exchangeCodeForSession", args: ["valid", { flowId: "test-flow" }] });
});

test("invalid, expired, reused, and non-recovery links cannot reach reset through the callback", async () => {
  for (const params of [new URLSearchParams(), new URLSearchParams("error=access_denied&code=ignored")]) {
    const { auth, calls } = fakeAuth();
    assert.equal(await completeRecovery(auth, params), "/forgot-password?error=recovery");
    assert.equal(calls.length, 0);
  }
  for (const result of [{ data: { session: null, user: null }, error: {} }, { data: { session: {}, user: {}, redirectType: null }, error: null }]) {
    assert.equal(await completeRecovery(fakeAuth({ exchangeCodeForSession: result }).auth, new URLSearchParams("code=expired")), "/forgot-password?error=recovery");
  }
});

test("refuses password updates when server-verified authentication is absent", async () => {
  for (const getUser of [{ data: { user: null }, error: null }, { data: { user: { id: "a" } }, error: {} }]) {
    const { auth, calls } = fakeAuth({ getUser });
    assert.match((await updateRecoveredPassword(auth, "new-password")).error!, /expired/);
    assert.deepEqual(calls.map(c => c.method), ["getUser"]);
  }
});

test("updates only the session user and signs out locally after success", async () => {
  const { auth, calls } = fakeAuth();
  assert.equal((await updateRecoveredPassword(auth, "new-password")).updated, true);
  assert.deepEqual(calls, [{ method: "getUser", args: [] }, { method: "updateUser", args: [{ password: "new-password" }] }, { method: "signOut", args: [{ scope: "local" }] }]);
});

test("provider rejection preserves the form and sign-out errors do not misreport a successful update", async () => {
  const rejected = fakeAuth({ updateUser: { error: { message: "Weak password" } } });
  assert.ok((await updateRecoveredPassword(rejected.auth, "password")).error);
  assert.equal(rejected.calls.some(c => c.method === "signOut"), false);
  const failedLogout = fakeAuth({ signOut: new Error("network") });
  assert.equal((await updateRecoveredPassword(failedLogout.auth, "password")).updated, true);
});
