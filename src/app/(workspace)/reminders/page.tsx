import { requireUser } from "@/lib/server/auth";
import { listReminders } from "@/lib/server/reminders";
import { listPets } from "@/lib/server/pets";
import { ReminderManager } from "@/components/care/reminders";
export default async function RemindersPage() {
  const user = await requireUser(); const [reminders, pets] = await Promise.all([listReminders(user.id), listPets(user.id)]);
  return <ReminderManager reminders={reminders} pets={pets} />;
}
