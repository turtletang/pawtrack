import { z } from "zod";
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform(v => v || null);
export const petSchema = z.object({
  name: z.string().trim().min(1, "Please enter a name.").max(80),
  species: z.enum(["Dog", "Cat", "Bird", "Rabbit", "Other"]),
  breed: optionalText(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine(v => {
    const date = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v && date <= new Date();
  }, "Enter a valid date that is not in the future.").nullable().optional().transform(v => v || null),
  sex: z.enum(["MALE", "FEMALE", "UNKNOWN"]).nullable().optional(),
  weight: z.number().positive().max(9999.99).multipleOf(0.01).nullable().optional(),
  photoUrl: z.url().max(2048).refine(v => v.startsWith("https://"), "Use an HTTPS image URL.").nullable().optional(),
}).strict();
export type PetInput = z.input<typeof petSchema>;
export type PetView = {
  id: string; name: string; species: string; breed: string | null; dateOfBirth: string | null;
  sex: "MALE" | "FEMALE" | "UNKNOWN" | null; weight: string | null; latestWeight?: string | null; photoUrl: string | null;
  createdAt: string; updatedAt: string;
};
export const petIdSchema = z.uuid();
