import { NextResponse } from "next/server";
import { apiUser, apiError } from "@/lib/server/http";
import { listDocuments } from "@/lib/server/documents";
export async function GET(request: Request) {
  try { const user = await apiUser(request); return NextResponse.json({ documents: await listDocuments(user.id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
