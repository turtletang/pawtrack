import { HealthOverview } from "@/components/health/health-overview";
import { ownerHealth } from "@/lib/server/health-records";
import { medicationStatus, upcomingCare } from "@/lib/health-records";
import { Dashboard } from "@/components/dashboard";
import { requireUser } from "@/lib/server/auth";
import { listPets } from "@/lib/server/pets";
export default async function DashboardPage() {
  const user = await requireUser();
  const [pets, health] = await Promise.all([listPets(user.id), ownerHealth(user.id)]);
  const summary = { recordCount: health.reduce((sum, pet) => sum + pet.records.weights.length + pet.records.vaccinations.length + pet.records.vetVisits.length, 0), medicationCount: health.flatMap(pet => pet.records.medications).filter(record => medicationStatus(record) === "Active").length, vaccineCount: upcomingCare(health).length };
  return <><Dashboard pets={pets} summary={summary} /><HealthOverview pets={health} /></>;
}
