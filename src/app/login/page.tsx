import { AuthPage } from "@/components/auth-page";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <AuthPage mode="login" confirmationError={(await searchParams).error === "confirmation"} />;
}
