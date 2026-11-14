// Keep validation errors free of connection strings and embedded credentials.
export function runtimeDatabaseUrl(value: string, deployed = process.env.VERCEL === "1") {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("DATABASE_URL is invalid."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must be PostgreSQL.");
  if (deployed && !["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") || "")) throw new Error("Vercel DATABASE_URL requires a verified TLS sslmode setting.");
  return value;
}
