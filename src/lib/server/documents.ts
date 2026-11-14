import "server-only";
import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_BUCKET, MAX_DOCUMENT_BYTES, SIGNED_URL_SECONDS, validateDocument, documentUploadSchema, documentTypes, stagingPath, UPLOAD_RESERVATION_MS, STAGING_GRANT_MS, type DocumentView } from "@/lib/documents";
import { db } from "./db";
import { HttpError } from "./http";
import { requireOwnedPet } from "./pets";
import type { Document, StorageObject } from "@/generated/prisma/client";

function view(record: Document & { pet: { name: string } }): DocumentView {
  return { id: record.id, petId: record.petId, petName: record.pet.name, name: record.name, mimeType: record.mimeType, sizeBytes: record.sizeBytes, createdAt: record.createdAt.toISOString() };
}
export async function listDocuments(ownerId: string, petId?: string) {
  if (petId) await requireOwnedPet(petId, ownerId);
  return (await db().document.findMany({ where: { status: "READY", pet: { ownerId }, ...(petId ? { petId } : {}) }, include: { pet: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })).map(view);
}
async function ownedDocument(id: string, petId: string, ownerId: string, readyOnly = true) {
  const record = await db().document.findFirst({ where: { id, petId, pet: { ownerId }, ...(readyOnly ? { status: "READY" as const } : {}) } });
  if (!record) throw new HttpError(404, "Document not found.");
  return record;
}
function adminStorage(timeout = 20000, deadline = Date.now()+45000) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new HttpError(503, "Private document processing is not configured.");
  return createSupabaseClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(Math.max(1, Math.min(timeout, deadline-Date.now()))) }) },
  }).storage.from(DOCUMENT_BUCKET);
}
async function queueDocumentCleanup(record: Document, ownerId: string) {
  // Staging grants cannot be revoked individually: preserve their original expiry grace.
  const paths = [record.storagePath, stagingPath(ownerId, record.petId, record.id, record.mimeType)];
  await db().$transaction(async tx => {
    await tx.document.updateMany({ where: { id: record.id, pet: { ownerId } }, data: { status: "DELETING" } });
    await tx.storageObject.updateMany({ where: { path: paths[0], ownerId }, data: { status: "DELETING", leaseUntil: new Date() } });
    await tx.storageObject.updateMany({ where: { path: paths[1], ownerId }, data: { status: "DELETING" } });
  });
  return paths;
}
export async function reserveDocument(petId: string, ownerId: string, body: unknown) {
  await requireOwnedPet(petId, ownerId);
  adminStorage(); // Fail before reserving if server-side verification cannot run.
  const parsed = documentUploadSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, "Choose a supported file with a valid name and size between 1 byte and 10 MB.");
  const file = parsed.data; const id = randomUUID();
  const path = `${ownerId}/${petId}/${id}.${documentTypes[file.mimeType]}`;
  const staging = stagingPath(ownerId, petId, id, file.mimeType);
  const record = await db().$transaction(async tx => {
    await tx.storageObject.createMany({ data: [
      { id, path, petId, ownerId, leaseUntil: new Date(Date.now()+UPLOAD_RESERVATION_MS) },
      { id: randomUUID(), path: staging, petId, ownerId, leaseUntil: new Date(Date.now()+STAGING_GRANT_MS) },
    ] });
    return tx.document.create({ data: { id, storagePath: path, ...file, status: "UPLOADING", pet: { connect: { id: petId, ownerId } } } });
  });
  try {
    const { data, error } = await (await createClient(20000)).storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(staging, { upsert: false });
    if (error || !data?.signedUrl) throw new Error("Upload grant failed");
    return { documentId: id, url: data.signedUrl, expiresIn: 7200, reservationExpiresIn: UPLOAD_RESERVATION_MS/1000 };
  } catch {
    try { await queueDocumentCleanup(record, ownerId); } catch { /* Original leases remain durable. */ }
    throw new HttpError(502, "Couldn't prepare a private upload. Please try again.");
  }
}
async function stagedBytes(path: string, deadline: number) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new HttpError(503, "Private document processing is not configured.");
  const url = `${supabaseUrl()}/storage/v1/object/authenticated/${DOCUMENT_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(Math.max(1,Math.min(20000,deadline-Date.now()))) });
  if (!response.ok || !response.body) throw new HttpError(502, "The staged file couldn't be read. Please upload it again.");
  if (Number(response.headers.get("content-length")) > MAX_DOCUMENT_BYTES) { await response.body.cancel(); throw new HttpError(413, "Maximum file size is 10 MB."); }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_DOCUMENT_BYTES) { await reader.cancel(); throw new HttpError(413, "Maximum file size is 10 MB."); }
    chunks.push(value);
  }
  return { bytes: new Uint8Array(Buffer.concat(chunks)), mimeType: response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() };
}
export async function completeDocument(id: string, petId: string, ownerId: string) {
  const deadline = Date.now()+45000;
  const record = await ownedDocument(id, petId, ownerId, false);
  if (record.status === "READY") return view(await db().document.findUniqueOrThrow({ where: { id }, include: { pet: { select: { name: true } } } }));
  if (record.status !== "UPLOADING") throw new HttpError(409, "This upload is unavailable or already being verified. Refresh before retrying.");
  const storage = adminStorage(20000,deadline);
  const claimed = await db().$transaction(async tx => {
    const lease = await tx.storageObject.updateMany({ where: { id, ownerId, status: "UPLOADING", leaseUntil: { gt: new Date() } }, data: { status: "VERIFYING", leaseUntil: new Date(Date.now()+5*60_000) } });
    if (!lease.count) throw new HttpError(409, "The upload reservation expired or is already being verified.");
    const changed = await tx.document.updateMany({ where: { id, petId, pet: { ownerId }, status: "UPLOADING" }, data: { status: "VERIFYING" } });
    if (!changed.count) throw new HttpError(409, "This upload is no longer available.");
    return true;
  });
  if (!claimed) throw new HttpError(409, "Unable to claim upload.");
  const staging = stagingPath(ownerId, petId, id, record.mimeType);
  try {
    const file = await stagedBytes(staging,deadline);
    if (file.bytes.length !== record.sizeBytes || file.mimeType !== record.mimeType) throw new HttpError(422, "The uploaded file doesn't match its reserved size or type.");
    try { validateDocument(record.name, record.mimeType, file.bytes); }
    catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "Invalid document."); }
    // Publish the validated byte snapshot to a different key. No browser receives a grant
    // for this final key, and user RLS denies all final-key inserts/overwrites.
    const uploaded = await storage.upload(record.storagePath, file.bytes, { contentType: record.mimeType, upsert: false, cacheControl: "0" });
    if (uploaded.error) throw new HttpError(502, "The validated document couldn't be saved.");
    const result = await db().$transaction(async tx => {
      const inventory = await tx.storageObject.updateMany({ where: { id, status: "VERIFYING", leaseUntil: { gt: new Date() } }, data: { status: "READY" } });
      const document = await tx.document.updateMany({ where: { id, petId, pet: { ownerId }, status: "VERIFYING" }, data: { status: "READY" } });
      if (!inventory.count || !document.count) throw new Error("Upload claim no longer valid");
      await tx.storageObject.updateMany({ where: { path: staging, ownerId }, data: { status: "DELETING" } });
      return view(await tx.document.findUniqueOrThrow({ where: { id }, include: { pet: { select: { name: true } } } }));
    });
    try { await adminStorage(5000,deadline).remove([staging]); } catch { /* Inventory retries after the upload grant expires. */ }
    return result;
  } catch (error) {
    // A lost commit acknowledgment must not delete an already published, valid document.
    try {
      const published = await db().document.findFirst({ where: { id, petId, pet: { ownerId }, status: "READY" }, include: { pet: { select: { name: true } } } });
      if (published) return view(published);
    } catch { /* A later retry can resolve an uncertain commit using the durable state. */ }
    try {
      const paths = await queueDocumentCleanup(record, ownerId);
      await storage.remove(paths);
    } catch { /* Durable inventory retries uncertain Storage/DB outcomes. */ }
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "The document couldn't be verified. Any partial objects are queued for cleanup.");
  }
}
export async function signedDocument(id: string, petId: string, ownerId: string, download: boolean) {
  const record = await ownedDocument(id, petId, ownerId);
  const { data, error } = await (await createClient(30000)).storage.from(DOCUMENT_BUCKET).createSignedUrl(record.storagePath, SIGNED_URL_SECONDS, download ? { download: record.name } : {});
  if (error || !data?.signedUrl) throw new HttpError(502, "This document is temporarily unavailable.");
  return { url: data.signedUrl, expiresIn: SIGNED_URL_SECONDS, mimeType: record.mimeType, name: record.name };
}
export async function deleteDocument(id: string, petId: string, ownerId: string) {
  const record = await ownedDocument(id, petId, ownerId, false);
  await db().$transaction(async tx => {
    await tx.document.updateMany({ where: { id, petId, pet: { ownerId } }, data: { status: "DELETING" } });
    await tx.storageObject.upsert({ where: { path: record.storagePath }, create: { id, path: record.storagePath, petId, ownerId, status: "DELETING", leaseUntil: new Date() }, update: { status: "DELETING", leaseUntil: new Date() } });
  });
  const staging = documentTypes[record.mimeType as keyof typeof documentTypes] ? stagingPath(ownerId, petId, id, record.mimeType) : null;
  if (staging) await db().storageObject.updateMany({ where: { path: staging, ownerId }, data: { status: "DELETING" } });
  try {
    const { error } = await (await createClient(30000)).storage.from(DOCUMENT_BUCKET).remove([record.storagePath]);
    if (error) return { pending: true };
    await db().document.deleteMany({ where: { id, petId, pet: { ownerId }, status: "DELETING" } });
    return { pending: false };
  } catch { return { pending: true }; }
}
export async function cleanupStorage(deadline = Date.now() + 45000) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || Date.now()+10000 > deadline) return { skipped: true, removed: 0, failed: 0 };
  const storage = createSupabaseClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
  }).storage.from(DOCUMENT_BUCKET);
  const inventory = await db().$transaction(async tx => {
    const rows = await tx.$queryRaw<StorageObject[]>`SELECT s.* FROM "StorageObject" s LEFT JOIN "Document" d ON d."storagePath" = s.path
      WHERE (s.status IN ('UPLOADING', 'VERIFYING', 'DELETING') AND s."leaseUntil" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) OR (s.status = 'READY' AND d.id IS NULL)
      ORDER BY s."leaseUntil", s.id LIMIT 25 FOR UPDATE OF s SKIP LOCKED`;
    for (const row of rows) {
      await tx.storageObject.update({ where: { id: row.id }, data: { status: "DELETING", leaseUntil: new Date(Date.now()+5*60_000) } });
      await tx.document.updateMany({ where: { storagePath: row.path }, data: { status: "DELETING" } });
    }
    return rows;
  });
  let removed = 0; let failed = 0;
  for (const row of inventory) {
    if (Date.now()+10000 > deadline) break; // Unfinished claims expire and retry on a later job.
    try {
      const result = await storage.remove([row.path]);
      if (result.error) { failed++; continue; }
      await db().$transaction(async tx => {
        await tx.document.deleteMany({ where: { storagePath: row.path, status: "DELETING" } });
        // Retain a tombstone and repeat deletion daily, covering late/uncertain upload outcomes.
        await tx.storageObject.update({ where: { id: row.id }, data: { leaseUntil: new Date(Date.now()+86400000) } });
      });
      removed++;
    } catch { failed++; }
  }
  return { skipped: false, removed, failed };
}
