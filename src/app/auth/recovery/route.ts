import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { completeRecovery } from "@/lib/password-recovery";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = authConfigured()
    ? await completeRecovery((await createClient()).auth, url.searchParams)
    : "/setup";
  // Fixed destinations only: never redirect to a client-supplied next URL.
  const response = NextResponse.redirect(new URL(path, url.origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
