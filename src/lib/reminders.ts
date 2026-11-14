import { z } from "zod";
import { calendarDate, todayUTC } from "./health-records";
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes("\u0000"), "Invalid text.");
export const reminderSchema = z.object({ title: text(200), dueAt: calendarDate,
  category: z.enum(["MEDICATION", "VET_APPOINTMENT", "OTHER"]),
  notes: text(4000).nullable().optional(),
}).strict().transform(value => ({ ...value, notes: value.notes ?? null, dueAt: new Date(`${value.dueAt}T00:00:00.000Z`) }));
export const reminderActionSchema = z.object({ status: z.enum(["COMPLETED", "DISMISSED"]) }).strict();
export type ReminderView = { id: string; petId: string; petName: string; title: string; dueAt: string; notes: string | null;
  source: "MANUAL" | "VACCINATION"; category: "MEDICATION" | "VET_APPOINTMENT" | "OTHER";
  status: "PENDING" | "COMPLETED" | "DISMISSED"; completedAt: string | null; dismissedAt: string | null; processedAt: string | null };
export function reminderState(reminder: Pick<ReminderView, "status" | "dueAt">, today = todayUTC()) {
  if (reminder.status === "COMPLETED") return "Completed";
  if (reminder.status === "DISMISSED") return "Dismissed";
  return reminder.dueAt < today ? "Overdue" : "Upcoming";
}
