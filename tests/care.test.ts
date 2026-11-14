import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderSchema, reminderActionSchema, reminderState } from "../src/lib/reminders";
import { validateDocument, sniffDocument, MAX_DOCUMENT_BYTES } from "../src/lib/documents";
const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
test("reminders validate dates/categories and reject forged ownership/source/status", () => {
  const body = { title: " Checkup ", dueAt: "2026-01-02", category: "VET_APPOINTMENT" };
  assert.equal(reminderSchema.parse(body).title, "Checkup");
  for (const extra of [{ ownerId: "a" }, { petId: "a" }, { vaccinationId: "a" }, { source: "VACCINATION" }, { status: "COMPLETED" }, { dueAt: "2026-02-30" }, { title: "" }, { notes: "x".repeat(4001) }]) assert.equal(reminderSchema.safeParse({ ...body, ...extra }).success, false);
  assert.equal(reminderActionSchema.safeParse({ status: "COMPLETED" }).success, true);
  assert.equal(reminderActionSchema.safeParse({ status: "PENDING" }).success, false);
});
test("reminder statuses use UTC calendar dates, with terminal states taking priority", () => {
  assert.equal(reminderState({ status: "PENDING", dueAt: "2026-01-01" }, "2026-01-02"), "Overdue");
  assert.equal(reminderState({ status: "PENDING", dueAt: "2026-01-02" }, "2026-01-02"), "Upcoming");
  assert.equal(reminderState({ status: "COMPLETED", dueAt: "2026-01-01" }, "2026-01-02"), "Completed");
  assert.equal(reminderState({ status: "DISMISSED", dueAt: "2026-01-01" }, "2026-01-02"), "Dismissed");
});
test("document validation checks signatures, claimed MIME, safe names, and exact size limits", () => {
  assert.equal(validateDocument("report.pdf", "application/pdf", pdf).extension, "pdf");
  assert.equal(validateDocument("../report.pdf", "application/pdf", pdf).name, ".._report.pdf");
  assert.throws(() => validateDocument("bad.png", "image/png", pdf));
  assert.throws(() => validateDocument("bad.pdf", "application/pdf", new TextEncoder().encode("<script>alert(1)</script>")));
  assert.throws(() => validateDocument("empty.pdf", "application/pdf", new Uint8Array()));
  const full = new Uint8Array(MAX_DOCUMENT_BYTES); full.set(pdf);
  assert.equal(validateDocument("full.pdf", "application/pdf", full).mimeType, "application/pdf");
  assert.throws(() => validateDocument("oversize.pdf", "application/pdf", new Uint8Array(MAX_DOCUMENT_BYTES+1)));
  assert.throws(() => validateDocument("x".repeat(161), "application/pdf", pdf));
});
test("only PDF, JPEG, PNG and WebP signatures are accepted", () => {
  assert.equal(sniffDocument(new Uint8Array([0xff,0xd8,0xff,0x00])), "image/jpeg");
  assert.equal(sniffDocument(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])), "image/png");
  assert.equal(sniffDocument(new TextEncoder().encode("RIFF1234WEBP")), "image/webp");
  assert.equal(sniffDocument(new TextEncoder().encode("<svg></svg>")), null);
  assert.equal(sniffDocument(new Uint8Array([0xff,0xd8])), null);
});

test("upload reservations accept only bounded metadata, never caller-specified keys or owners", async () => {
  const { documentUploadSchema, stagingPath } = await import("../src/lib/documents");
  const metadata = { name: "report.pdf", mimeType: "application/pdf", sizeBytes: 10 };
  assert.equal(documentUploadSchema.safeParse(metadata).success,true);
  for (const extra of [{path:"victim/file"},{ownerId:"other"},{petId:"other"},{sizeBytes:0},{sizeBytes:MAX_DOCUMENT_BYTES+1},{mimeType:"text/html"}]) assert.equal(documentUploadSchema.safeParse({...metadata,...extra}).success,false);
  assert.equal(stagingPath("owner","pet","id","application/pdf"),"owner/pet/staging/id.pdf");
});
