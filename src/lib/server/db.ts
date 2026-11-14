import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { runtimeDatabaseUrl } from "@/lib/database-config";
import { PrismaClient } from "@/generated/prisma/client";
const globalDb = globalThis as unknown as { prisma?: PrismaClient; pgPool?: Pool };
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!globalDb.prisma) {
    const pool = new Pool({ connectionString: runtimeDatabaseUrl(process.env.DATABASE_URL), max: 3, min: 0,
      idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000, allowExitOnIdle: true });
    pool.on("error", error => console.error("Database pool error", error.name));
    if (process.env.VERCEL === "1") attachDatabasePool(pool);
    globalDb.pgPool = pool;
    // No statementNameGenerator: adapter-pg sends unnamed queries, compatible with transaction pooling.
    globalDb.prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  }
  return globalDb.prisma;
}
