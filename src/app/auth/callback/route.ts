import { callbackOrigin } from "@/lib/app-url";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authConfigured } from "@/lib/supabase/config";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  let path = "/login?error=confirmation";
  if (code && !url.searchParams.has("error") && !url.searchParams.has("error_code") && authConfigured()) {
    try {
      const flowId = url.searchParams.get("sb_flow_id");
      const { data, error } = await (await createClient()).auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      if (!error && data.user && data.session) {
        // Recovery links should never bypass the password screen via this callback.
        path = "redirectType" in data && data.redirectType === "recovery" ? "/reset-password" : "/dashboard";
      }
    } catch { /* Invalid/expired codes or upstream failures fail closed. */ }
  }
  const response = NextResponse.redirect(new URL(path, callbackOrigin(request.url)));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
