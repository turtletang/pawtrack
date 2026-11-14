import "server-only";
import { db } from "./db";
import { petSchema } from "@/lib/pet-validation";
import { ownedPetWhere } from "@/lib/ownership";
import { HttpError } from "./http";
import type { Pet, WeightRecord } from "@/generated/prisma/client";
export function serializePet(pet: Pet & { weights?: WeightRecord[] }) {
  return { id: pet.id, name: pet.name, species: pet.species, breed: pet.breed,
    dateOfBirth: pet.dateOfBirth?.toISOString().slice(0, 10) ?? null, sex: pet.sex,
    weight: pet.weight?.toString() ?? null, latestWeight: pet.weights?.[0]?.weightKg.toString() ?? pet.weight?.toString() ?? null, photoUrl: pet.photoUrl,
    createdAt: pet.createdAt.toISOString(), updatedAt: pet.updatedAt.toISOString() };
}
export function parsePet(body: unknown) {
  const result = petSchema.safeParse(body);
  if (!result.success) throw new HttpError(422, result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(" "));
  return { ...result.data, dateOfBirth: result.data.dateOfBirth ? new Date(`${result.data.dateOfBirth}T00:00:00.000Z`) : null };
}
export async function listPets(ownerId: string) {
  return (await db().pet.findMany({ where: { ownerId }, include: { weights: { orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 1 } }, orderBy: { createdAt: "desc" } })).map(serializePet);
}
export async function findPet(id: string, ownerId: string) {
  const pet = await db().pet.findFirst({ where: ownedPetWhere(id, ownerId), include: { weights: { orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 1 } } });
  if (!pet) throw new HttpError(404, "Pet not found.");
  return serializePet(pet);
}
export async function createPet(ownerId: string, body: unknown) {
  const data = parsePet(body);
  return db().$transaction(async tx => {
    await tx.user.upsert({ where: { id: ownerId }, create: { id: ownerId }, update: {} });
    return serializePet(await tx.pet.create({ data: { ...data, ownerId } }));
  });
}
export async function updatePet(id: string, ownerId: string, body: unknown) {
  const data = parsePet(body);
  // Authorization is part of the write predicate, avoiding check-then-write races.
  const pets = await db().pet.updateManyAndReturn({ where: ownedPetWhere(id, ownerId), data });
  if (!pets[0]) throw new HttpError(404, "Pet not found.");
  return findPet(id, ownerId);
}
export async function deletePet(id: string, ownerId: string) {
  const result = await db().pet.deleteMany({ where: ownedPetWhere(id, ownerId) });
  if (!result.count) throw new HttpError(404, "Pet not found.");
}
