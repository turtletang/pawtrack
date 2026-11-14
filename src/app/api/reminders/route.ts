import { NextResponse } from "next/server";
import { apiUser, apiError } from "@/lib/server/http";
import { listReminders } from "@/lib/server/reminders";
export async function GET(request: Request) {
  try { const user = await apiUser(request); return NextResponse.json({ reminders: await listReminders(user.id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
