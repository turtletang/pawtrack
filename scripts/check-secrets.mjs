import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const findings = [];
for (const path of tracked) {
  if (/(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith(".env.example")) findings.push(`${path}: environment file is tracked`);
  let text; try { text = await readFile(path, "utf8"); } catch { continue; }
  if (/sb_secret_[A-Za-z0-9_-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) findings.push(`${path}: possible private key`);
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(match[1],"base64url").toString()).role === "service_role") findings.push(`${path}: possible service-role JWT`); } catch { /* Not a JWT. */ }
  }
}
const sensitive = ["DATABASE_URL", "DIRECT_URL", "CRON_SECRET", "SUPABASE_SERVICE_ROLE_KEY"].map(name => ({name,value:process.env[name]})).filter(entry => entry.value?.length >= 12);
async function scanAssets(directory) {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name);
    if (entry.isDirectory()) await scanAssets(path);
    else {
      const bytes=await readFile(path);
      for (const secret of sensitive) if (bytes.includes(Buffer.from(secret.value))) findings.push(`${path}: contains private ${secret.name}`);
    }
  }
}
try { await stat(".next/static"); await scanAssets(".next/static"); }
catch { throw new Error("Run npm run build before the browser-asset secret check."); }
if (findings.length) { console.error([...new Set(findings)].join("\n")); process.exitCode=1; }
else console.log("Git-visible file checks and built browser assets: no detected private keys or configured private environment values. Values were not printed. This is a targeted check, not a full Git-history audit.");
