import "server-only";
import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_BUCKET, MAX_DOCUMENT_BYTES, SIGNED_URL_SECONDS, validateDocument, type DocumentView } from "@/lib/documents";
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
export async function documentFile(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data;/i.test(contentType)) throw new HttpError(415, "Expected a multipart file upload.");
  const limit = MAX_DOCUMENT_BYTES + 65536;
  if (Number(request.headers.get("content-length")) > limit) throw new HttpError(413, "Maximum file size is 10 MB.");
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, "Choose a file.");
  let size = 0; const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, "Maximum file size is 10 MB."); }
    chunks.push(value);
  }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData(); }
  catch { throw new HttpError(400, "Invalid file upload."); }
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0][0] !== "file" || !(entries[0][1] instanceof File)) throw new HttpError(422, "Upload one file in the file field.");
  const file = entries[0][1];
  if (file.size > MAX_DOCUMENT_BYTES) throw new HttpError(413, "Maximum file size is 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  try { return { ...validateDocument(file.name, file.type, bytes), bytes }; }
  catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "Invalid document."); }
}
export async function uploadDocument(request: Request, petId: string, ownerId: string) {
  await requireOwnedPet(petId, ownerId);
  const file = await documentFile(request); const id = randomUUID();
  const path = `${ownerId}/${petId}/${id}.${file.extension}`;
  const leaseUntil = new Date(Date.now() + 15 * 60_000);
  // Inventory survives pet/document cascades; no storage write occurs before it is durable.
  await db().$transaction(async tx => {
    await tx.storageObject.create({ data: { id, path, petId, ownerId, leaseUntil } });
    await tx.document.create({ data: { id, storagePath: path, name: file.name, mimeType: file.mimeType, sizeBytes: file.bytes.length, status: "UPLOADING", pet: { connect: { id: petId, ownerId } } } });
  });
  const storage = (await createClient(30000)).storage.from(DOCUMENT_BUCKET);
  try {
    const uploaded = await storage.upload(path, file.bytes, { contentType: file.mimeType, upsert: false, cacheControl: "0" });
    if (uploaded.error) throw new Error("Storage upload failed");
    return await db().$transaction(async tx => {
      const inventory = await tx.storageObject.updateMany({ where: { id, status: "UPLOADING", leaseUntil: { gt: new Date() } }, data: { status: "READY" } });
      const document = await tx.document.updateMany({ where: { id, petId, pet: { ownerId }, status: "UPLOADING" }, data: { status: "READY" } });
      if (!inventory.count || !document.count) throw new Error("Upload lease no longer valid");
      return view(await tx.document.findUniqueOrThrow({ where: { id }, include: { pet: { select: { name: true } } } }));
    });
  } catch {
    // If DB or Storage is unavailable, the original inventory row remains recoverable by cron.
    try {
      await db().$transaction([
        db().document.updateMany({ where: { id }, data: { status: "DELETING" } }),
        db().storageObject.updateMany({ where: { id }, data: { status: "DELETING", leaseUntil: new Date() } }),
      ]);
      const removed = await storage.remove([path]);
      if (!removed.error) await db().document.deleteMany({ where: { id, status: "DELETING" } });
    } catch { /* Retain inventory for retry, including uncertain upload outcomes. */ }
    throw new HttpError(502, "The document couldn't be saved. Please try again. Any partial upload is queued for cleanup.");
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
  const storage = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
  }).storage.from(DOCUMENT_BUCKET);
  const inventory = await db().$transaction(async tx => {
    const rows = await tx.$queryRaw<StorageObject[]>`SELECT s.* FROM "StorageObject" s LEFT JOIN "Document" d ON d."storagePath" = s.path
      WHERE (s.status IN ('UPLOADING', 'DELETING') AND s."leaseUntil" <= CURRENT_TIMESTAMP) OR (s.status = 'READY' AND d.id IS NULL)
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
