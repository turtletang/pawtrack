import { X509Certificate } from "node:crypto";
import { checkServerIdentity } from "node:tls";
import type { PoolConfig } from "pg";

function productionDatabase() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

// Keep validation errors free of connection strings and embedded credentials.
export function runtimeDatabaseUrl(value: string, deployed = productionDatabase()) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("DATABASE_URL is invalid."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must be PostgreSQL.");
  if (deployed && url.searchParams.get("sslmode") !== "verify-full") throw new Error("Production DATABASE_URL requires sslmode=verify-full for verified TLS.");
  return value;
}

function databaseCa(value: string) {
  const pem = value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  try {
    // Accept certificate bundles, but never a private key, file path, or partial PEM.
    if (!certificates?.length || pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, "").trim()) throw new Error();
    for (const certificate of certificates) {
      if (!new X509Certificate(certificate).ca) throw new Error();
    }
  } catch {
    throw new Error("SUPABASE_DB_CA_CERT must contain valid PEM CA certificates only.");
  }
  return certificates.join("\n") + "\n";
}

export function runtimeDatabaseConfig(
  value: string,
  caCertificate = process.env.SUPABASE_DB_CA_CERT,
  deployed = productionDatabase(),
): Pick<PoolConfig, "connectionString" | "ssl"> {
  const url = new URL(runtimeDatabaseUrl(value, deployed));
  if (deployed && !caCertificate?.trim()) throw new Error("SUPABASE_DB_CA_CERT is required for production database TLS.");
  if (!caCertificate?.trim()) return { connectionString: url.toString() };

  const ca = databaseCa(caCertificate);
  // pg parses the URI AFTER merging explicit options. These query parameters
  // would replace ssl (and can read local files), discarding our CA/verifier.
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("ssl") || key.toLowerCase() === "uselibpqcompat") url.searchParams.delete(key);
  }
  return {
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true, checkServerIdentity },
  };
}
