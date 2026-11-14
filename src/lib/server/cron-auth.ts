import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
export function validCronAuthorization(authorization: string | null, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 32 || !authorization) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
