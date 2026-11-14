import { test } from "node:test";
import assert from "node:assert/strict";
import { petSchema } from "../src/lib/pet-validation";
const valid = { name: " Milo ", species: "Dog" };
test("normalizes names and nullable optional fields", () => {
  const result = petSchema.parse({ ...valid, breed: "  " });
  assert.equal(result.name, "Milo"); assert.equal(result.breed, null);
});
test("accepts a complete profile", () => {
  assert.equal(petSchema.safeParse({ ...valid, breed: "Retriever", dateOfBirth: "2020-02-29", sex: "MALE", weight: 28.5, photoUrl: "https://example.com/pet.jpg" }).success, true);
});
test("rejects forged ownership and unknown fields", () => {
  for (const extra of [{ ownerId: "attacker" }, { id: "chosen-id" }, { createdAt: "2020-01-01" }]) assert.equal(petSchema.safeParse({ ...valid, ...extra }).success, false);
});
test("rejects invalid dates, including calendar normalization and future dates", () => {
  for (const dateOfBirth of ["2023-02-29", "2024-02-30", "2020-13-01", "2999-01-01", "not-a-date"]) assert.equal(petSchema.safeParse({ ...valid, dateOfBirth }).success, false, dateOfBirth);
});
test("rejects missing names, invalid species, negative or imprecise weights and unsafe image protocols", () => {
  for (const patch of [{ name: " " }, { name: "x".repeat(81) }, { species: "Dragon" }, { weight: -1 }, { weight: 0 }, { weight: 10000 }, { weight: 1.234 }, { weight: "5" }, { photoUrl: "javascript:alert(1)" }, { photoUrl: "http://example.com/photo" }]) assert.equal(petSchema.safeParse({ ...valid, ...patch }).success, false);
});
