import { requireUser } from "@/lib/server/auth";
import { ownerHealth } from "@/lib/server/health-records";
import { HealthHub } from "@/components/health/health-hub";
export default async function HealthRecordsPage() {
  const user = await requireUser();
  return <HealthHub pets={await ownerHealth(user.id)} />;
}
