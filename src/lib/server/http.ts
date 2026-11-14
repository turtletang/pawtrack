import "server-only";
import { NextResponse } from "next/server";
import { currentUser } from "./auth";
import { authConfigured } from "@/lib/supabase/config";
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function apiUser(request: Request) {
  if (!authConfigured()) throw new HttpError(503, "Authentication is not configured.");
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Please sign in to continue.");
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) throw new HttpError(403, "Invalid request origin.");
  }
  return user;
}
export async function jsonBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new HttpError(415, "Expected JSON.");
  // Bound actual streamed bytes, not the client-provided Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A JSON body is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) { await reader.cancel(); throw new HttpError(413, "Request is too large."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new HttpError(400, "Invalid JSON."); }
}
export function apiError(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && "code" in error && error.code === "P2025") return NextResponse.json({ error: "Pet or record not found." }, { status: 404 });
  console.error("API failure", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "We couldn't complete this request. Please try again." }, { status: 500 });
}
