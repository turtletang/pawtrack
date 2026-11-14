import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authConfigured } from "@/lib/supabase/config";
export async function currentUser() {
  if (!authConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}
export async function requireUser() {
  if (!authConfigured()) redirect("/setup");
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
