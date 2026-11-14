"use client";
import { useActionState } from "react";
import Link from "next/link";
import { LoaderCircle, ArrowRight } from "lucide-react";
import { authenticate, type AuthState } from "@/app/auth/actions";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export function AuthForm({ mode, configured }: { mode: "login" | "signup"; configured: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(authenticate.bind(null, mode), {});
  return <><form action={action} className="space-y-5"><label className="block"><span className="field-label">Email address</span><Input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label><label className="block"><span className="field-label">Password</span><Input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} maxLength={128} required placeholder="At least 8 characters" /></label>{mode === "login" && <div className="text-right"><Link href="/forgot-password" className="text-xs text-primary underline">Forgot password?</Link></div>}{!configured && <p className="alert">Authentication needs configuration. <Link className="underline" href="/setup">Follow the setup guide</Link> to connect Supabase.</p>}{state.error && <p className="alert" role="alert">{state.error}</p>}{state.message && <p className="alert success" role="status">{state.message}</p>}<Button className="w-full" disabled={pending || !configured}>{pending ? <LoaderCircle className="animate-spin" size={16} /> : <>{mode === "login" ? "Sign in" : "Create your account"}<ArrowRight size={15} /></>}</Button></form><p className="text-center text-xs text-muted-foreground mt-6">{mode === "login" ? "New to PawTrack?" : "Already a pet parent here?"} <Link className="text-primary font-semibold" href={mode === "login" ? "/signup" : "/login"}>{mode === "login" ? "Create an account" : "Sign in"}</Link></p><Link href="/preview" className="block text-center text-xs text-muted-foreground underline mt-7">Explore the design preview</Link></>;
}
