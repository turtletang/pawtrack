// Shared by every individual-pet query. ownerId always comes from verified Supabase auth.
export function ownedPetWhere(id: string, authenticatedUserId: string) {
  if (!authenticatedUserId) throw new Error("An authenticated user is required.");
  return { id, ownerId: authenticatedUserId };
}
