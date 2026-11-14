import { z } from "zod";

export const resources = ["weights", "vaccinations", "vet-visits", "medications"] as const;
export type HealthResource = typeof resources[number];
export const healthResourceSchema = z.enum(resources);
export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return value >= "0001-01-01" && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid calendar date.");
export function todayUTC(now = new Date()) { return now.toISOString().slice(0, 10); }
const pastDate = calendarDate.refine(value => value <= todayUTC(), "This date cannot be in the future.");
const requiredText = (max: number) => z.string().trim().min(1, "This field is required.").max(max).refine(value => !value.includes("\u0000"), "Null characters are not supported.");
const notes = z.string().trim().max(4000).refine(value => !value.includes("\u0000"), "Null characters are not supported.").nullable().optional().transform(value => value || null);
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const weightSchema = z.object({
  weightKg: z.number().positive().max(9999.99).multipleOf(0.01), recordedAt: pastDate, notes,
}).strict().transform(value => ({ ...value, recordedAt: toDate(value.recordedAt) }));
export const vaccinationSchema = z.object({
  name: requiredText(160), administeredAt: pastDate, nextDueAt: calendarDate.nullable().optional(), notes,
}).strict().refine(value => !value.nextDueAt || value.nextDueAt >= value.administeredAt, {
  message: "Next due date cannot precede the administered date.", path: ["nextDueAt"],
}).transform(value => ({ ...value, administeredAt: toDate(value.administeredAt), nextDueAt: value.nextDueAt ? toDate(value.nextDueAt) : null }));
export const vetVisitSchema = z.object({
  visitedAt: pastDate, clinic: requiredText(200), reason: requiredText(300), notes,
}).strict().transform(value => ({ ...value, visitedAt: toDate(value.visitedAt) }));
export const medicationSchema = z.object({
  name: requiredText(160), dosage: requiredText(200), frequency: requiredText(200), startsAt: calendarDate,
  endsAt: calendarDate.nullable().optional(), notes,
}).strict().refine(value => !value.endsAt || value.endsAt >= value.startsAt, {
  message: "End date cannot precede the start date.", path: ["endsAt"],
}).transform(value => ({ ...value, startsAt: toDate(value.startsAt), endsAt: value.endsAt ? toDate(value.endsAt) : null }));

export type WeightView = { kind: "weights"; id: string; petId: string; recordedAt: string; weightKg: number; notes: string | null };
export type VaccinationView = { kind: "vaccinations"; id: string; petId: string; name: string; administeredAt: string; nextDueAt: string | null; notes: string | null };
export type VetVisitView = { kind: "vet-visits"; id: string; petId: string; visitedAt: string; clinic: string; reason: string | null; notes: string | null };
export type MedicationView = { kind: "medications"; id: string; petId: string; name: string; dosage: string; frequency: string | null; startsAt: string; endsAt: string | null; notes: string | null };
export type HealthRecord = WeightView | VaccinationView | VetVisitView | MedicationView;
export type HealthBundle = { weights: WeightView[]; vaccinations: VaccinationView[]; vetVisits: VetVisitView[]; medications: MedicationView[] };
export function vaccinationStatus(due: string | null, today = todayUTC()) {
  return !due ? "No due date" : due < today ? "Overdue" : due === today ? "Due today" : "Upcoming";
}
export function medicationStatus(record: Pick<MedicationView, "startsAt" | "endsAt">, today = todayUTC()) {
  if (record.startsAt > today) return "Scheduled";
  return record.endsAt && record.endsAt < today ? "Historical" : "Active";
}
export type WeightUnit = "kg" | "lb";
export const LB_PER_KG = 2.2046226218;
export function displayWeight(kg: number, unit: WeightUnit) { return Number((unit === "lb" ? kg * LB_PER_KG : kg).toFixed(2)); }
export function kilograms(value: number, unit: WeightUnit) { return Number((unit === "lb" ? value / LB_PER_KG : value).toFixed(2)); }
export function recordDate(record: HealthRecord) {
  switch (record.kind) {
    case "weights": return record.recordedAt;
    case "vaccinations": return record.administeredAt;
    case "vet-visits": return record.visitedAt;
    case "medications": return record.startsAt;
  }
}
export type PetHealthView = { petId: string; name: string; records: HealthBundle };
export function upcomingCare(pets: PetHealthView[]) {
  return pets.flatMap(pet => pet.records.vaccinations.filter(v => v.nextDueAt).map(record => ({
    petId: pet.petId, petName: pet.name, id: record.id, name: record.name, due: record.nextDueAt!,
  }))).sort((a,b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
}
