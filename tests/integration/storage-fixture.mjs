import { randomUUID } from "node:crypto";
// Simulated upstream Storage HTTP service. The actual app, SDK and PostgreSQL remain real.
export function storageFixture({ identities, serviceKey, database }) {
  const objects = new Map(); const signed = new Map(); const uploadGrants = new Map(); const failedDelete = new Set();
  return async function handle(request, response) {
    const url = new URL(request.url, "http://fixture");
    const credential = request.headers.authorization?.replace(/^Bearer /, "");
    const owner = identities.get(credential); const admin = credential === serviceKey;
    const fail = (status, message) => { response.statusCode = status; response.end(JSON.stringify({ statusCode: String(status), error: "StorageError", message })); };
    async function allowed(path, action) {
      if (admin) return true;
      if (!owner) return false;
      const client = await database().connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [owner]);
        await client.query("SET LOCAL ROLE authenticated");
        await client.query("SET LOCAL TIME ZONE 'Asia/Shanghai'");
        const operation = action === "upload" ? "insert" : action === "delete" ? "delete" : "read";
        const result = await client.query("SELECT public.pawtrack_document_access($1, $2) AS allowed", [path, operation]);
        if (!result.rows[0].allowed) return false;
        // Exercise the actual manual RLS policies against the local stand-in table.
        if (action === "upload") await client.query("INSERT INTO storage.objects (name,bucket_id) VALUES ($1,'pet-documents')", [path]);
        else {
          const visible = await client.query(action === "delete" ? "DELETE FROM storage.objects WHERE name=$1 RETURNING name" : "SELECT name FROM storage.objects WHERE name=$1", [path]);
          if (objects.has(path) && visible.rowCount !== 1) return false;
        }
        return true;
      } finally { await client.query("ROLLBACK"); client.release(); }
    }
    if (url.pathname === "/test-storage-expire") {
      if (!admin) return fail(401, "Denied");
      uploadGrants.clear();
      await database().query(`UPDATE "StorageObject" SET "leaseUntil"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - interval '1 minute' WHERE path LIKE '%/staging/%' OR status IN ('UPLOADING','VERIFYING')`);
      response.end(JSON.stringify({ expired: true })); return;
    }
    if (url.pathname.startsWith("/storage/v1/object/upload/sign/pet-documents/")) {
      const path=decodeURIComponent(url.pathname.split("/storage/v1/object/upload/sign/pet-documents/")[1]);
      if (request.method === "POST") {
        if (!await allowed(path,"upload")) return fail(403,"Denied upload grant");
        const token=randomUUID(); uploadGrants.set(token,{path, expires:Date.now()+7200000});
        response.end(JSON.stringify({url:`/object/upload/sign/pet-documents/${path}?token=${token}`})); return;
      }
      if (request.method === "PUT") {
        const grant=uploadGrants.get(url.searchParams.get("token"));
        if (!grant || grant.path!==path || grant.expires<Date.now()) return fail(403,"Invalid upload grant");
        if (objects.has(path)) return fail(409,"Already exists; grant is not upsertable");
        const chunks=[]; for await(const chunk of request) chunks.push(chunk); const bytes=Buffer.concat(chunks);
        if (bytes.length>10485760) return fail(413,"Bucket file limit exceeded");
        objects.set(path,{bytes,mime:request.headers["content-type"]});
        await database().query("INSERT INTO storage.objects(name,bucket_id) VALUES ($1,'pet-documents')",[path]);
        if (bytes.includes(Buffer.from("FAIL_UPLOAD"))) return fail(500,"Uncertain direct upload failure");
        response.end(JSON.stringify({Key:`pet-documents/${path}`})); return;
      }
    }
    if (url.pathname === "/test-storage-stats") {
      if (!admin) return fail(401, "Denied");
      response.end(JSON.stringify({ count: objects.size, paths: [...objects.keys()] })); return;
    }
    if (url.pathname.startsWith("/storage/v1/object/authenticated/pet-documents/") && request.method === "GET") {
      const path = decodeURIComponent(url.pathname.split("/storage/v1/object/authenticated/pet-documents/")[1]);
      if (!await allowed(path, "read")) return fail(403, "Denied");
      const stored = objects.get(path); if (!stored) return fail(404,"Missing object");
      response.setHeader("Content-Type",stored.mime); response.end(stored.bytes); return;
    }
    if (url.pathname.startsWith("/storage/v1/object/sign/pet-documents/") && request.method === "GET") {
      const path = decodeURIComponent(url.pathname.split("/storage/v1/object/sign/pet-documents/")[1]);
      const grant = signed.get(url.searchParams.get("token")); const stored = objects.get(path);
      if (!grant || grant.path !== path || grant.expires < Date.now() || !stored) return fail(403, "Invalid signed URL");
      response.setHeader("Content-Type", stored.mime); response.setHeader("Cache-Control", "no-store"); response.end(stored.bytes); return;
    }
    if (url.pathname.startsWith("/storage/v1/object/sign/pet-documents/") && request.method === "POST") {
      const path = decodeURIComponent(url.pathname.split("/storage/v1/object/sign/pet-documents/")[1]);
      if (!await allowed(path, "read")) return fail(403, "Denied");
      if (!objects.has(path)) return fail(404, "Missing object");
      let body=""; for await (const chunk of request) body+=chunk;
      const token=randomUUID(); signed.set(token, { path, expires: Date.now()+JSON.parse(body).expiresIn*1000 });
      response.end(JSON.stringify({ signedURL: `/object/sign/pet-documents/${path}?token=${token}` })); return;
    }
    if (url.pathname.startsWith("/storage/v1/object/pet-documents/") && request.method === "POST") {
      const path = decodeURIComponent(url.pathname.split("/storage/v1/object/pet-documents/")[1]);
      if (!await allowed(path, "upload")) return fail(403, "Denied");
      if (objects.has(path)) return fail(409, "Already exists");
      const chunks=[]; for await (const chunk of request) chunks.push(chunk); const bytes=Buffer.concat(chunks);
      objects.set(path, { bytes, mime: request.headers["content-type"] });
      await database().query("INSERT INTO storage.objects(name,bucket_id) VALUES ($1,'pet-documents')",[path]);
      if (bytes.includes(Buffer.from("FAIL_UPLOAD"))) return fail(500, "Simulated uncertain upload failure");
      response.end(JSON.stringify({ Id: randomUUID(), Key: `pet-documents/${path}` })); return;
    }
    if (url.pathname === "/storage/v1/object/pet-documents" && request.method === "DELETE") {
      let body=""; for await (const chunk of request) body+=chunk;
      const paths=JSON.parse(body).prefixes;
      for (const path of paths) {
        if (!await allowed(path, "delete")) return fail(403, "Denied");
        if (objects.get(path)?.bytes.includes(Buffer.from("FAIL_DELETE_ONCE")) && !failedDelete.has(path)) { failedDelete.add(path); return fail(500, "Simulated deletion failure"); }
        objects.delete(path);
        await database().query("DELETE FROM storage.objects WHERE name=$1",[path]);
      }
      response.end(JSON.stringify(paths.map(name => ({ name })))); return;
    }
    fail(403, "Private bucket: signed URL or authenticated access required");
  };
}
