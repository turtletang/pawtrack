import { test } from "node:test";
import assert from "node:assert/strict";
import { weightSchema, vaccinationSchema, vetVisitSchema, medicationSchema, calendarDate, vaccinationStatus, medicationStatus, displayWeight, kilograms, upcomingCare } from "../src/lib/health-records";
const valid = {
  weights: { weightKg: 12.25, recordedAt: "2025-01-02" },
  vaccinations: { name: "Rabies", administeredAt: "2025-01-02", nextDueAt: "2026-01-02" },
  visits: { visitedAt: "2025-01-02", clinic: "Paw Clinic", reason: "Annual exam" },
  medications: { name: "Prescription", dosage: "1 tablet", frequency: "Daily", startsAt: "2025-01-02", endsAt: "2025-02-02" },
};
test("health schemas validate dates and normalize them to UTC midnight", () => {
  assert.equal(calendarDate.safeParse("0000-01-01").success, false);
  assert.equal(calendarDate.safeParse("2023-02-29").success, false);
  assert.equal(calendarDate.safeParse("2024-02-29").success, true);
  assert.equal(calendarDate.safeParse("2025-02-30").success, false);
  assert.equal(weightSchema.parse(valid.weights).recordedAt.toISOString(), "2025-01-02T00:00:00.000Z");
});
test("all health resources accept valid records and reject ownership or parent changes", () => {
  for (const [schema, body] of [[weightSchema, valid.weights], [vaccinationSchema, valid.vaccinations], [vetVisitSchema, valid.visits], [medicationSchema, valid.medications]] as const) {
    assert.equal(schema.safeParse(body).success, true);
    for (const extra of [{ ownerId: "forged" }, { petId: "forged" }, { id: "forged" }]) assert.equal(schema.safeParse({ ...body, ...extra }).success, false);
    assert.equal(schema.safeParse({ ...body, notes: "x".repeat(4001) }).success, false);
    assert.equal(schema.safeParse({ ...body, notes: "invalid\u0000note" }).success, false);
  }
});
test("weights must be positive bounded numbers with two decimal places, dated no later than today", () => {
  for (const weightKg of [0, -1, 10000, 2.345, "12", Infinity, NaN]) assert.equal(weightSchema.safeParse({ ...valid.weights, weightKg }).success, false);
  assert.equal(weightSchema.safeParse({ ...valid.weights, recordedAt: "2999-01-01" }).success, false);
});
test("vaccinations and visits cannot be recorded in the future; due date cannot precede vaccination", () => {
  assert.equal(vaccinationSchema.safeParse({ ...valid.vaccinations, administeredAt: "2999-01-01" }).success, false);
  assert.equal(vaccinationSchema.safeParse({ ...valid.vaccinations, nextDueAt: "2024-01-01" }).success, false);
  assert.equal(vetVisitSchema.safeParse({ ...valid.visits, visitedAt: "2999-01-01" }).success, false);
  assert.equal(vetVisitSchema.safeParse({ ...valid.visits, reason: " " }).success, false);
});
test("medication schedules permit future starts but require valid ranges and frequency", () => {
  assert.equal(medicationSchema.safeParse({ ...valid.medications, startsAt: "2999-01-01", endsAt: null }).success, true);
  assert.equal(medicationSchema.safeParse({ ...valid.medications, endsAt: "2024-01-01" }).success, false);
  assert.equal(medicationSchema.safeParse({ ...valid.medications, frequency: " " }).success, false);
});
test("vaccination due dates and medication status use inclusive UTC date boundaries", () => {
  const today = "2026-01-02";
  assert.equal(vaccinationStatus("2026-01-01", today), "Overdue");
  assert.equal(vaccinationStatus(today, today), "Due today");
  assert.equal(vaccinationStatus("2026-01-03", today), "Upcoming");
  assert.equal(vaccinationStatus(null, today), "No due date");
  assert.equal(medicationStatus({ startsAt: today, endsAt: today }, today), "Active");
  assert.equal(medicationStatus({ startsAt: "2025-01-01", endsAt: "2026-01-01" }, today), "Historical");
  assert.equal(medicationStatus({ startsAt: "2026-01-03", endsAt: null }, today), "Scheduled");
  assert.equal(medicationStatus({ startsAt: "2025-01-01", endsAt: null }, today), "Active");
});
test("kg/lb conversion preserves practical precision and upcoming care sorts dates", () => {
  assert.equal(displayWeight(10, "lb"), 22.05);
  assert.equal(kilograms(22.05, "lb"), 10);
  assert.equal(displayWeight(4.25, "kg"), 4.25);
  const care = upcomingCare([{ petId: "a", name: "Pet", records: { weights: [], vetVisits: [], medications: [], vaccinations: [
    { kind: "vaccinations", id: "2", petId: "a", name: "B", administeredAt: "2025-01-01", nextDueAt: "2027-01-01", notes: null },
    { kind: "vaccinations", id: "1", petId: "a", name: "A", administeredAt: "2025-01-01", nextDueAt: "2026-01-01", notes: null },
    { kind: "vaccinations", id: "3", petId: "a", name: "C", administeredAt: "2025-01-01", nextDueAt: null, notes: null },
  ] } }]);
  assert.deepEqual(care.map(item => item.id), ["1", "2"]);
});
