import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const recoveryEmailSchema = z.string().trim().max(254).pipe(z.email());
export const newPasswordSchema = z.object({
  password: z.string().min(8, "Use at least 8 characters.").max(128, "Use at most 128 characters."),
  confirmPassword: z.string(),
}).refine(value => value.password === value.confirmPassword, {
  message: "The passwords do not match.", path: ["confirmPassword"],
});

export type RecoveryState = { error?: string; message?: string; updated?: boolean };
type RecoveryAuth = Pick<SupabaseClient["auth"], "resetPasswordForEmail" | "getUser" | "updateUser" | "signOut" | "exchangeCodeForSession">;

// Never derive email destinations from an untrusted form, Host, or Origin header.
export function authRedirectUrl(path: "/auth/callback" | "/auth/recovery", siteUrl = "http://localhost:3000") {
  const url = new URL(siteUrl);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("APP_URL must be an HTTPS origin (or http://localhost:3000 locally).");
  }
  return new URL(path, url).toString();
}

export function recoveryRedirectUrl(siteUrl?: string) {
  return authRedirectUrl("/auth/recovery", siteUrl);
}

export async function sendRecoveryEmail(auth: RecoveryAuth, email: string, redirectTo: string): Promise<RecoveryState> {
  try {
    const { error } = await auth.resetPasswordForEmail(email, { redirectTo });
    // Match the response for unknown and known email addresses, including provider errors.
    if (error?.status === 429) return { error: "Too many requests. Please wait a few minutes before trying again." };
    return { message: "If an account exists for that email, you'll receive a password reset link. Check your inbox and spam folder, and open the link in this browser." };
  } catch {
    return { error: "We couldn't connect to the authentication service. Please try again shortly." };
  }
}

export async function completeRecovery(auth: RecoveryAuth, params: URLSearchParams) {
  const failure = "/forgot-password?error=recovery";
  const code = params.get("code");
  if (!code || params.has("error") || params.has("error_code")) return failure;
  try {
    const flowId = params.get("sb_flow_id");
    const { data, error } = await auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    // auth-js includes redirectType at runtime, but its public return type omits it.
    if (error || !data.session || !data.user || !("redirectType" in data) || data.redirectType !== "recovery") return failure;
    return "/reset-password";
  } catch { return failure; }
}

export async function updateRecoveredPassword(auth: RecoveryAuth, password: string): Promise<RecoveryState> {
  try {
    // Revalidate with the Auth server on submission; page guards alone are insufficient.
    const { data, error } = await auth.getUser();
    if (error || !data.user) return { error: "Your session has expired. Please request a new password reset link." };
    const result = await auth.updateUser({ password });
    if (result.error) return { error: "We couldn't update your password. Use a different password that meets your account's requirements, or request a new reset link." };
    // Once updateUser succeeds, never report a password failure if sign-out fails.
    try {
      const signedOut = await auth.signOut({ scope: "local" });
      if (!signedOut.error) return { updated: true, message: "Your password has been updated. Sign in with your new password." };
    } catch { /* The password update has already succeeded. */ }
    return { updated: true, message: "Your password was updated. We couldn't sign out this browser; please sign out before testing your new password." };
  } catch {
    return { error: "The authentication service couldn't complete the request. Please try again or request a new reset link." };
  }
}
