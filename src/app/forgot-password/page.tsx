import { AuthLayout } from "@/components/auth-layout";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { authConfigured } from "@/lib/supabase/config";
export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const invalidLink = (await searchParams).error === "recovery";
  return <AuthLayout title="A fresh start." description="Enter your account's email and we'll send you a link to reset your password.">
    {invalidLink && <p role="alert" className="alert mb-5">This reset link is invalid, expired, or already used, or it was opened in a different browser. Request a new link and open it in the same browser where you requested it.</p>}
    <PasswordRecoveryForm mode="request" configured={authConfigured()} />
  </AuthLayout>;
}
