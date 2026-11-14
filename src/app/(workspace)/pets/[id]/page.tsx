import Link from "next/link";
import { DocumentManager } from "@/components/care/documents";
import { listDocuments } from "@/lib/server/documents";
import { notFound } from "next/navigation";
import { ArrowLeft, PawPrint } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { findPet } from "@/lib/server/pets";
import { listHealth } from "@/lib/server/health-records";
import { HttpError } from "@/lib/server/http";
import { petIdSchema } from "@/lib/pet-validation";
import { HealthManager } from "@/components/health/health-manager";
import { healthResourceSchema } from "@/lib/health-records";
export default async function PetProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string }> }) {
  const user = await requireUser(); const { id } = await params;
  if (!petIdSchema.safeParse(id).success) notFound();
  const [pet, records, documents] = await Promise.all([findPet(id, user.id), listHealth(id, user.id), listDocuments(user.id, id)]).catch(error => {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  });
  const section = healthResourceSchema.safeParse((await searchParams).section);
  return <><Link className="subtle-link mb-5" href="/pets"><ArrowLeft size={14} />All companions</Link><div className="page-heading"><div><div className="eyebrow mb-2">THEIR HEALTH STORY</div><h1 className="flex items-center gap-3"><PawPrint className="text-[#8eaa7e]" size={26} /><span className="min-w-0 break-words">{pet.name}</span></h1><p>{pet.breed || pet.species}{pet.dateOfBirth ? ` · Born ${pet.dateOfBirth}` : ""} · Latest weight: {pet.latestWeight ? `${pet.latestWeight} kg` : "Not recorded"}</p></div></div><HealthManager petId={id} records={records} initial={section.success ? section.data : "weights"} /><DocumentManager documents={documents} pets={[pet]} petId={id} /></>;
}
