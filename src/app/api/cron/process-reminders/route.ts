import { NextResponse } from "next/server";
import { validCronAuthorization } from "@/lib/server/cron-auth";
import { processReminders } from "@/lib/server/reminders";
import { cleanupStorage } from "@/lib/server/documents";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) return NextResponse.json({ error: "Scheduled processing is not configured." }, { status: 503, headers });
  if (!validCronAuthorization(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers });
  try {
    const deadline = Date.now() + 45000;
    const reminders = await processReminders();
    const cleanup = await cleanupStorage(deadline);
    return NextResponse.json({ reminders, cleanup }, { headers });
  } catch (error) {
    console.error("Scheduled processing failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Scheduled processing failed; a later execution can retry safely." }, { status: 500, headers });
  }
}
