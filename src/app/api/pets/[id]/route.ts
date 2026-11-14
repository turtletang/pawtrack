import { NextResponse } from "next/server";
import { apiError, apiUser, HttpError, jsonBody } from "@/lib/server/http";
import { deletePet, findPet, updatePet } from "@/lib/server/pets";
import { petIdSchema } from "@/lib/pet-validation";
type Context = { params: Promise<{ id: string }> };
async function idFrom(context: Context) {
  const { id } = await context.params;
  if (!petIdSchema.safeParse(id).success) throw new HttpError(400, "Invalid pet ID.");
  return id;
}
export async function GET(request: Request, context: Context) {
  try { const user = await apiUser(request); return NextResponse.json({ pet: await findPet(await idFrom(context), user.id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
export async function PUT(request: Request, context: Context) {
  try { const user = await apiUser(request); return NextResponse.json({ pet: await updatePet(await idFrom(context), user.id, await jsonBody(request)) }); }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try { const user = await apiUser(request); await deletePet(await idFrom(context), user.id); return new NextResponse(null, { status: 204 }); }
  catch (error) { return apiError(error); }
}
