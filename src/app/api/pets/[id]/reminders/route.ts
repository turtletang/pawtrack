import { NextResponse } from "next/server";
import { apiUser, apiError, jsonBody } from "@/lib/server/http";
import { validatedIds } from "@/lib/server/care-http";
import { listReminders, createReminder } from "@/lib/server/reminders";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { const user = await apiUser(request); const { id } = await validatedIds(context.params); return NextResponse.json({ reminders: await listReminders(user.id, id) }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: Context) {
  try { const user = await apiUser(request); const { id } = await validatedIds(context.params); return NextResponse.json({ reminder: await createReminder(id, user.id, await jsonBody(request)) }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
