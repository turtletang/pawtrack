import "server-only";
import { z } from "zod";
import { HttpError } from "./http";
export async function validatedIds<T extends Record<string, string>>(params: Promise<T>): Promise<T> {
  const values = await params;
  if (Object.values(values).some(value => !z.uuid().safeParse(value).success)) throw new HttpError(400, "Invalid resource ID.");
  return values;
}
