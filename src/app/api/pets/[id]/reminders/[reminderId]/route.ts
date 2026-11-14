import { NextResponse } from "next/server";
import { apiUser, apiError, jsonBody } from "@/lib/server/http";
import { validatedIds } from "@/lib/server/care-http";
import { findReminder, actOnReminder } from "@/lib/server/reminders";
type Context = { params: Promise<{ id: string; reminderId: string }> };
export async function GET(request: Request, context: Context) {
  try { const user = await apiUser(request); const { id, reminderId } = await validatedIds(context.params); return NextResponse.json({ reminder: await findReminder(id, user.id, reminderId) }); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { const user = await apiUser(request); const { id, reminderId } = await validatedIds(context.params); return NextResponse.json({ reminder: await actOnReminder(id, user.id, reminderId, await jsonBody(request)) }); }
  catch (error) { return apiError(error); }
}
