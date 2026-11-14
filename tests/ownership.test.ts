import { test } from "node:test";
import assert from "node:assert/strict";
import { ownedPetWhere } from "../src/lib/ownership";
test("scopes a pet ID to the verified user instead of accepting an unscoped ID", () => {
  assert.deepEqual(ownedPetWhere("pet-a", "owner-a"), { id: "pet-a", ownerId: "owner-a" });
  assert.deepEqual(ownedPetWhere("pet-a", "owner-b"), { id: "pet-a", ownerId: "owner-b" });
  assert.notDeepEqual(ownedPetWhere("pet-a", "owner-a"), ownedPetWhere("pet-a", "owner-b"));
});
test("fails closed without an authenticated principal", () => {
  assert.throws(() => ownedPetWhere("pet-a", ""), /authenticated user/);
});
