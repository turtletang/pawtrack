import { AuthLayout } from "./auth-layout";
import { AuthForm } from "./auth-form";
import { authConfigured } from "@/lib/supabase/config";
export function AuthPage({ mode, confirmationError = false }: { mode: "login" | "signup"; confirmationError?: boolean }) {
  return <AuthLayout title={mode === "login" ? "Hello again, pet parent." : "Good care starts here."} description={mode === "login" ? "Sign in to your little corner of their world." : "Create a home for your pets' health and happiness."}>
    {confirmationError && <p role="alert" className="alert mb-5">This confirmation link has expired or is invalid. Try signing in or request a new confirmation email through signup.</p>}
    <AuthForm mode={mode} configured={authConfigured()} />
  </AuthLayout>;
}
