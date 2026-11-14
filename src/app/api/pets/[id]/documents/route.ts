import { NextResponse } from "next/server";
import { apiUser, apiError } from "@/lib/server/http";
import { validatedIds } from "@/lib/server/care-http";
import { listDocuments, uploadDocument } from "@/lib/server/documents";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { const user = await apiUser(request); const { id } = await validatedIds(context.params); return NextResponse.json({ documents: await listDocuments(user.id, id) }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: Context) {
  try { const user = await apiUser(request); const { id } = await validatedIds(context.params); return NextResponse.json({ document: await uploadDocument(request, id, user.id) }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
