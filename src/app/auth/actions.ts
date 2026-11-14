"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authRedirectUrl } from "@/lib/password-recovery";
import { createClient } from "@/lib/supabase/server";
import { authConfigured } from "@/lib/supabase/config";
const credentials = z.object({ email: z.email().max(254), password: z.string().min(8).max(128) });
export type AuthState = { error?: string; message?: string };
export async function authenticate(mode: "login" | "signup", _previous: AuthState, form: FormData): Promise<AuthState> {
  if (!authConfigured()) return { error: "Connect your Supabase project first. See the setup guide." };
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter a valid email and a password of 8–128 characters." };
  const supabase = await createClient();
  if (mode === "signup") {
    let emailRedirectTo: string;
    try { emailRedirectTo = authRedirectUrl("/auth/callback", process.env.APP_URL); }
    catch { return { error: "Please check the app authentication configuration." }; }
    const { data, error } = await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo } });
    if (error) return { error: "We couldn't create your account. Please try again shortly." };
    if (!data.session) return { message: "Check your email to confirm your account, then sign in." };
  } else {
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: "Unable to sign in. Check your credentials and confirm your email." };
  }
  redirect("/dashboard");
}
export async function signOut() {
  if (authConfigured()) {
    const { error } = await (await createClient()).auth.signOut();
    if (error) throw new Error("Sign out failed. Please try again.");
  }
  redirect("/login");
}
