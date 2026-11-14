import "dotenv/config";
import { defineConfig } from "prisma/config";
const migrateIndex = process.argv.indexOf("migrate");
const needsDirectUrl = migrateIndex >= 0 && ["deploy", "dev", "status", "resolve", "reset"].includes(process.argv[migrateIndex+1]);
if (needsDirectUrl && !process.env.DIRECT_URL) throw new Error("Set DIRECT_URL to the direct or session-pooler connection before running migrations.");
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_URL || "postgresql://unconfigured:unconfigured@localhost:5432/pawtrack" },
});
