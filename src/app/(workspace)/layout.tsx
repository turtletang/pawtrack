import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { todayUTC } from "@/lib/health-records";
import { Shell } from "@/components/shell";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const endOfDay = new Date(Date.parse(todayUTC()) + 86400000);
  const reminderCount = await db().reminder.count({ where: { pet: { ownerId: user.id }, status: "PENDING", dueAt: { lt: endOfDay } } });
  return <Shell email={user.email} reminderCount={reminderCount}>{children}</Shell>;
}
