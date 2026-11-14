import { NextResponse } from "next/server";
import { apiUser, apiError } from "@/lib/server/http";
import { validatedIds } from "@/lib/server/care-http";
import { signedDocument, deleteDocument } from "@/lib/server/documents";
type Context = { params: Promise<{ id: string; documentId: string }> };
export async function GET(request: Request, context: Context) {
  try { const user = await apiUser(request); const { id, documentId } = await validatedIds(context.params); return NextResponse.json(await signedDocument(documentId, id, user.id, new URL(request.url).searchParams.get("download") === "1"), { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } }); }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try { const user = await apiUser(request); const { id, documentId } = await validatedIds(context.params); const result = await deleteDocument(documentId, id, user.id); return NextResponse.json(result, { status: result.pending ? 202 : 200 }); }
  catch (error) { return apiError(error); }
}
