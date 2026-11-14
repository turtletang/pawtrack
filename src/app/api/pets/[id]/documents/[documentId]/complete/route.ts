import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser, apiError, jsonBody, HttpError } from "@/lib/server/http";
import { validatedIds } from "@/lib/server/care-http";
import { completeDocument } from "@/lib/server/documents";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string; documentId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const user = await apiUser(request); const { id, documentId } = await validatedIds(context.params);
    if (!z.object({}).strict().safeParse(await jsonBody(request)).success) throw new HttpError(422, "No file paths or metadata are accepted during completion.");
    return NextResponse.json({ document: await completeDocument(documentId, id, user.id) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
