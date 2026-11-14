import { NextResponse } from "next/server";
import { apiError, apiUser, HttpError, jsonBody } from "@/lib/server/http";
import { petIdSchema } from "@/lib/pet-validation";
import { healthResourceSchema } from "@/lib/health-records";
import { deleteHealth, readHealth, saveHealth } from "@/lib/server/health-records";
type Context = { params: Promise<{ id: string; resource: string; recordId: string }> };
async function parameters(context: Context) {
  const params = await context.params;
  if (!petIdSchema.safeParse(params.id).success || !petIdSchema.safeParse(params.recordId).success) throw new HttpError(400, "Invalid record or pet ID.");
  const resource = healthResourceSchema.safeParse(params.resource);
  if (!resource.success) throw new HttpError(404, "Resource not found.");
  return { ...params, resource: resource.data };
}
export async function GET(request: Request, context: Context) {
  try {
    const user = await apiUser(request); const { id, resource, recordId } = await parameters(context);
    return NextResponse.json({ record: await readHealth(id, user.id, resource, recordId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    const user = await apiUser(request); const { id, resource, recordId } = await parameters(context);
    return NextResponse.json({ record: await saveHealth(id, user.id, resource, await jsonBody(request), recordId) });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const user = await apiUser(request); const { id, resource, recordId } = await parameters(context);
    await deleteHealth(id, user.id, resource, recordId);
    return new NextResponse(null, { status: 204 });
  } catch (error) { return apiError(error); }
}
