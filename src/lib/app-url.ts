// Canonical, configured origin only. Never infer production destinations from Host/X-Forwarded-*.
export function appOrigin(siteUrl = process.env.APP_URL, deployed = process.env.VERCEL === "1") {
  if (!siteUrl && deployed) throw new Error("APP_URL is required on Vercel.");
  const url = new URL(siteUrl || "http://localhost:3000");
  const localHttp = url.protocol === "http:" && url.hostname === "localhost" && !deployed;
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("APP_URL must be an HTTPS origin (localhost HTTP is development-only).");
  return url.origin;
}
export function callbackOrigin(requestUrl: string) {
  const origin = appOrigin();
  const incoming = new URL(requestUrl);
  if (process.env.VERCEL !== "1" && ["localhost", "127.0.0.1", "[::1]"].includes(incoming.hostname)) return incoming.origin;
  return origin;
}
