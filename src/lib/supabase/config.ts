export function supabaseUrl(value = process.env.NEXT_PUBLIC_SUPABASE_URL, deployed = process.env.VERCEL === "1") {
  let url: URL;
  try { url = new URL(value || ""); } catch { throw new Error("Supabase URL is not configured correctly."); }
  const localHttp = !deployed && url.protocol === "http:" && ["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Supabase requires an HTTPS project origin in production.");
  return url.origin;
}
export function authConfigured() {
  try { return Boolean(supabaseUrl() && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); }
  catch { return false; }
}
