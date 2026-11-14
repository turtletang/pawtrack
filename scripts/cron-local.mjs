import "dotenv/config";
// Explicit manual invocation only; never accept an arbitrary target URL or print the secret.
if (process.env.APP_URL && new URL(process.env.APP_URL).origin !== "http://localhost:3000") throw new Error("This helper only targets http://localhost:3000. Use the isolated integration suite for safe fixture testing.");
if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) throw new Error("Set a server-only CRON_SECRET of at least 32 random characters in .env.");
console.log("Processing reminders and queued Storage cleanup for the app at localhost:3000 (using that app's configured database and bucket).");
const response = await fetch("http://localhost:3000/api/cron/process-reminders", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(60000) });
console.log(JSON.stringify(await response.json(), null, 2));
if (!response.ok) process.exitCode = 1;
