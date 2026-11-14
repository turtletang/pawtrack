import "server-only";
import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./http";
import { ownedPetWhere } from "@/lib/ownership";
import { weightSchema, vaccinationSchema, vetVisitSchema, medicationSchema, type HealthResource, type HealthBundle } from "@/lib/health-records";
import type { WeightRecord, Vaccination, VetVisit, Medication } from "@/generated/prisma/client";

const date = (value: Date) => value.toISOString().slice(0, 10);
const weightView = (r: WeightRecord) => ({ kind: "weights" as const, id: r.id, petId: r.petId, recordedAt: date(r.recordedAt), weightKg: Number(r.weightKg), notes: r.notes });
const vaccinationView = (r: Vaccination) => ({ kind: "vaccinations" as const, id: r.id, petId: r.petId, name: r.name, administeredAt: date(r.administeredAt), nextDueAt: r.nextDueAt ? date(r.nextDueAt) : null, notes: r.notes });
const visitView = (r: VetVisit) => ({ kind: "vet-visits" as const, id: r.id, petId: r.petId, visitedAt: date(r.visitedAt), clinic: r.clinic, reason: r.reason, notes: r.notes });
const medicationView = (r: Medication) => ({ kind: "medications" as const, id: r.id, petId: r.petId, name: r.name, dosage: r.dosage, frequency: r.frequency, startsAt: date(r.startsAt), endsAt: r.endsAt ? date(r.endsAt) : null, notes: r.notes ?? r.instructions });
function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(422, result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join(" "));
  return result.data;
}
export async function requireOwnedPet(petId: string, ownerId: string) {
  if (!await db().pet.findFirst({ where: ownedPetWhere(petId, ownerId), select: { id: true } })) throw new HttpError(404, "Pet not found.");
}
export async function listHealth(petId: string, ownerId: string): Promise<HealthBundle> {
  await requireOwnedPet(petId, ownerId);
  // Scope every query through the parent even after the existence check.
  const where = { petId, pet: { ownerId } };
  const [weights, vaccinations, visits, medications] = await Promise.all([
    db().weightRecord.findMany({ where, orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }] }),
    db().vaccination.findMany({ where, orderBy: [{ administeredAt: "desc" }, { id: "desc" }] }),
    db().vetVisit.findMany({ where, orderBy: [{ visitedAt: "desc" }, { id: "desc" }] }),
    db().medication.findMany({ where, orderBy: [{ startsAt: "desc" }, { id: "desc" }] }),
  ]);
  return { weights: weights.map(weightView), vaccinations: vaccinations.map(vaccinationView), vetVisits: visits.map(visitView), medications: medications.map(medicationView) };
}
export async function readHealth(petId: string, ownerId: string, resource: HealthResource, id?: string) {
  await requireOwnedPet(petId, ownerId);
  const where = { petId, pet: { ownerId }, ...(id ? { id } : {}) };
  const list = resource === "weights" ? (await db().weightRecord.findMany({ where, orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }] })).map(weightView)
    : resource === "vaccinations" ? (await db().vaccination.findMany({ where, orderBy: [{ administeredAt: "desc" }, { id: "desc" }] })).map(vaccinationView)
    : resource === "vet-visits" ? (await db().vetVisit.findMany({ where, orderBy: [{ visitedAt: "desc" }, { id: "desc" }] })).map(visitView)
    : (await db().medication.findMany({ where, orderBy: [{ startsAt: "desc" }, { id: "desc" }] })).map(medicationView);
  if (!id) return list;
  if (!list[0]) throw new HttpError(404, "Health record not found.");
  return list[0];
}
export async function saveHealth(petId: string, ownerId: string, resource: HealthResource, body: unknown, id?: string) {
  await requireOwnedPet(petId, ownerId);
  const where = { id, petId, pet: { ownerId } };
  // connect includes verified ownership in the insert predicate, never a client-supplied owner.
  const pet = { connect: ownedPetWhere(petId, ownerId) };
  switch (resource) {
    case "weights": {
      const data = parse(weightSchema, body);
      const record = id ? (await db().weightRecord.updateManyAndReturn({ where, data }))[0] : await db().weightRecord.create({ data: { ...data, pet } });
      if (record) return weightView(record); break;
    }
    case "vaccinations": {
      const data = parse(vaccinationSchema, body);
      const record = id ? (await db().vaccination.updateManyAndReturn({ where, data }))[0] : await db().vaccination.create({ data: { ...data, pet } });
      if (record) return vaccinationView(record); break;
    }
    case "vet-visits": {
      const data = parse(vetVisitSchema, body);
      const record = id ? (await db().vetVisit.updateManyAndReturn({ where, data }))[0] : await db().vetVisit.create({ data: { ...data, pet } });
      if (record) return visitView(record); break;
    }
    case "medications": {
      const data = { ...parse(medicationSchema, body), instructions: null };
      const record = id ? (await db().medication.updateManyAndReturn({ where, data }))[0] : await db().medication.create({ data: { ...data, pet } });
      if (record) return medicationView(record); break;
    }
  }
  throw new HttpError(404, "Health record not found.");
}
export async function deleteHealth(petId: string, ownerId: string, resource: HealthResource, id: string) {
  const where = { id, petId, pet: { ownerId } };
  const result = resource === "weights" ? await db().weightRecord.deleteMany({ where })
    : resource === "vaccinations" ? await db().vaccination.deleteMany({ where })
    : resource === "vet-visits" ? await db().vetVisit.deleteMany({ where }) : await db().medication.deleteMany({ where });
  if (!result.count) throw new HttpError(404, "Health record not found.");
}

export async function ownerHealth(ownerId: string) {
  const pets = await db().pet.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, include: {
    weights: { orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }] },
    vaccinations: { orderBy: [{ administeredAt: "desc" }, { id: "desc" }] },
    vetVisits: { orderBy: [{ visitedAt: "desc" }, { id: "desc" }] },
    medications: { orderBy: [{ startsAt: "desc" }, { id: "desc" }] },
  } });
  return pets.map(pet => ({ petId: pet.id, name: pet.name, records: {
    weights: pet.weights.map(weightView), vaccinations: pet.vaccinations.map(vaccinationView),
    vetVisits: pet.vetVisits.map(visitView), medications: pet.medications.map(medicationView),
  } }));
}
