"use client";
import { useActionState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { requestPasswordReset, resetPassword } from "@/app/auth/recovery-actions";
import type { RecoveryState } from "@/lib/password-recovery";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export function PasswordRecoveryForm({ mode, configured }: { mode: "request" | "reset"; configured: boolean }) {
  const [state, action, pending] = useActionState<RecoveryState, FormData>(mode === "request" ? requestPasswordReset : resetPassword, {});
  return <>
    {state.updated ? <div><p role="status" className="alert success mb-5">{state.message}</p><Button asChild className="w-full"><Link href="/login">Back to sign in</Link></Button></div> : <form action={action} className="space-y-5">
      <fieldset disabled={pending || !configured} className="space-y-5">
        {mode === "request" ? <label className="block"><span className="field-label">Email address</span><Input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label> : <>
          <label className="block"><span className="field-label">New password</span><Input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} placeholder="At least 8 characters" aria-describedby="password-guidance" /></label>
          <p id="password-guidance" className="text-xs text-muted-foreground">Use 8–128 characters and meet your account&apos;s password requirements.</p>
          <label className="block"><span className="field-label">Confirm new password</span><Input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} placeholder="Enter your new password again" /></label>
        </>}
        <Button className="w-full" type="submit">{pending && <LoaderCircle size={16} className="animate-spin" />}{pending ? "Please wait…" : mode === "request" ? "Send reset link" : "Save new password"}</Button>
      </fieldset>
      {!configured && <p className="alert">Authentication needs configuration. <Link href="/setup" className="underline">Follow the setup guide.</Link></p>}
      {state.error && <p role="alert" className="alert">{state.error}</p>}
      {state.message && <p role="status" className="alert success">{state.message}</p>}
    </form>}
    <div className="text-center mt-6 text-xs text-muted-foreground"><Link href={mode === "request" ? "/login" : "/forgot-password"} className="underline">{mode === "request" ? "Back to sign in" : "Request a new reset link"}</Link></div>
  </>;
}
