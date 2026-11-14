import { NextResponse } from "next/server";
import { apiError, apiUser, jsonBody } from "@/lib/server/http";
import { createPet, listPets } from "@/lib/server/pets";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const user = await apiUser(request); return NextResponse.json({ pets: await listPets(user.id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { const user = await apiUser(request); return NextResponse.json({ pet: await createPet(user.id, await jsonBody(request)) }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
