import "server-only";
import { db } from "./db";
import { HttpError } from "./http";
import { requireOwnedPet } from "./pets";
import { reminderSchema, reminderActionSchema, type ReminderView } from "@/lib/reminders";
import type { Prisma, Reminder, Vaccination } from "@/generated/prisma/client";

export async function syncVaccination(tx: Prisma.TransactionClient, vaccination: Vaccination) {
  const now = new Date();
  await tx.reminder.updateMany({ where: { vaccinationId: vaccination.id, status: "PENDING",
    ...(vaccination.nextDueAt ? { dueAt: { not: vaccination.nextDueAt } } : {}) }, data: { status: "DISMISSED", dismissedAt: now } });
  if (!vaccination.nextDueAt) return 0;
  const result = await tx.reminder.createMany({ data: [{ petId: vaccination.petId, vaccinationId: vaccination.id,
    dueAt: vaccination.nextDueAt, title: `${vaccination.name} vaccination due`, source: "VACCINATION" }], skipDuplicates: true });
  await tx.reminder.updateMany({ where: { vaccinationId: vaccination.id, dueAt: vaccination.nextDueAt, title: { not: `${vaccination.name} vaccination due` } }, data: { title: `${vaccination.name} vaccination due` } });
  return result.count;
}
export async function processReminders() {
  return db().$transaction(async tx => {
    const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(724891031) AS locked`;
    if (!lock.locked) return { skipped: true, generated: 0, processed: 0 };
    // Lock source rows before reconciliation, matching the locks held by vaccination edits.
    const vaccinations = await tx.$queryRaw<Vaccination[]>`SELECT * FROM "Vaccination" ORDER BY id FOR UPDATE`;
    let generated = 0;
    for (const vaccination of vaccinations) generated += await syncVaccination(tx, vaccination);
    await tx.$executeRaw`UPDATE "Reminder" r SET status = 'DISMISSED', "dismissedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE r.source = 'VACCINATION' AND r.status = 'PENDING' AND NOT EXISTS
      (SELECT 1 FROM "Vaccination" v WHERE v.id = r."vaccinationId" AND v."petId" = r."petId" AND v."nextDueAt" = r."dueAt")`;
    const result = await tx.reminder.updateMany({ where: { status: "PENDING", dueAt: { lte: new Date() }, processedAt: null }, data: { processedAt: new Date() } });
    return { skipped: false, generated, processed: result.count };
  }, { timeout: 45000 });
}
function view(record: Reminder & { pet: { name: string } }): ReminderView {
  return { id: record.id, petId: record.petId, petName: record.pet.name, title: record.title, dueAt: record.dueAt.toISOString().slice(0,10), notes: record.notes,
    source: record.source, category: record.category, status: record.status, completedAt: record.completedAt?.toISOString() ?? null,
    dismissedAt: record.dismissedAt?.toISOString() ?? null, processedAt: record.processedAt?.toISOString() ?? null };
}
export async function listReminders(ownerId: string, petId?: string) {
  if (petId) await requireOwnedPet(petId, ownerId);
  return (await db().reminder.findMany({ where: { pet: { ownerId }, ...(petId ? { petId } : {}) }, include: { pet: { select: { name: true } } }, orderBy: [{ dueAt: "asc" }, { id: "asc" }] })).map(view);
}
export async function findReminder(petId: string, ownerId: string, id: string) {
  const record = await db().reminder.findFirst({ where: { id, petId, pet: { ownerId } }, include: { pet: { select: { name: true } } } });
  if (!record) throw new HttpError(404, "Reminder not found.");
  return view(record);
}
export async function createReminder(petId: string, ownerId: string, body: unknown) {
  const parsed = reminderSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, parsed.error.issues.map(issue => issue.message).join(" "));
  const record = await db().reminder.create({ data: { ...parsed.data, pet: { connect: { id: petId, ownerId } } }, include: { pet: { select: { name: true } } } });
  return view(record);
}
export async function actOnReminder(petId: string, ownerId: string, id: string, body: unknown) {
  const parsed = reminderActionSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, "Choose completed or dismissed.");
  const { status } = parsed.data;
  await db().reminder.updateMany({ where: { id, petId, pet: { ownerId }, status: { not: status } }, data: {
    status, completedAt: status === "COMPLETED" ? new Date() : null, dismissedAt: status === "DISMISSED" ? new Date() : null,
  } });
  return findReminder(petId, ownerId, id);
}
