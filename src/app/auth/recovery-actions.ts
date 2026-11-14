"use server";
import { authConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { recoveryEmailSchema, newPasswordSchema, recoveryRedirectUrl, sendRecoveryEmail, updateRecoveredPassword, type RecoveryState } from "@/lib/password-recovery";

export async function requestPasswordReset(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  if (!authConfigured()) return { error: "Authentication is not configured. Please follow the setup guide." };
  const email = recoveryEmailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  try {
    return await sendRecoveryEmail((await createClient()).auth, email.data, recoveryRedirectUrl(process.env.APP_URL));
  } catch { return { error: "Password recovery is unavailable. Please check the app's authentication configuration." }; }
}

export async function resetPassword(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  if (!authConfigured()) return { error: "Authentication is not configured. Please follow the setup guide." };
  const parsed = newPasswordSchema.safeParse({ password: form.get("password"), confirmPassword: form.get("confirmPassword") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return updateRecoveredPassword((await createClient()).auth, parsed.data.password);
}
