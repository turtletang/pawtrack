import { NextResponse } from "next/server";
import { apiError, apiUser, HttpError, jsonBody } from "@/lib/server/http";
import { petIdSchema } from "@/lib/pet-validation";
import { healthResourceSchema } from "@/lib/health-records";
import { readHealth, saveHealth } from "@/lib/server/health-records";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; resource: string }> };
async function parameters(context: Context) {
  const params = await context.params;
  const id = petIdSchema.safeParse(params.id); const resource = healthResourceSchema.safeParse(params.resource);
  if (!id.success) throw new HttpError(400, "Invalid pet ID.");
  if (!resource.success) throw new HttpError(404, "Resource not found.");
  return { id: id.data, resource: resource.data };
}
export async function GET(request: Request, context: Context) {
  try {
    const user = await apiUser(request); const { id, resource } = await parameters(context);
    return NextResponse.json({ records: await readHealth(id, user.id, resource) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const user = await apiUser(request); const { id, resource } = await parameters(context);
    return NextResponse.json({ record: await saveHealth(id, user.id, resource, await jsonBody(request)) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
