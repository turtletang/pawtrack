import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { authConfigured } from "@/lib/supabase/config";
import { currentUser } from "@/lib/server/auth";
export const dynamic = "force-dynamic";
export default async function ResetPassword() {
  if (!authConfigured()) redirect("/setup");
  if (!await currentUser()) redirect("/forgot-password?error=recovery");
  return <AuthLayout title="Choose a new password." description="Give your account a fresh start with a strong, unique password.">
    <PasswordRecoveryForm mode="reset" configured />
  </AuthLayout>;
}
