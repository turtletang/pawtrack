"use client";
import { useState } from "react";
import Link from "next/link";
import { PawPrint } from "lucide-react";
import { HealthManager } from "./health-manager";
import { EmptyState } from "@/components/dashboard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { HealthResource, PetHealthView } from "@/lib/health-records";
export function HealthHub({ pets, initial = "weights" }: { pets: PetHealthView[]; initial?: HealthResource }) {
  const [selected, setSelected] = useState(pets[0]?.petId || "");
  const pet = pets.find(pet => pet.petId === selected) || pets[0];
  return <><div className="page-heading"><div><h1>{initial === "medications" ? "Medications" : "Health Records"}</h1><p>Little milestones and important details, all together.</p></div></div>{!pet ? <Card><EmptyState icon={PawPrint} title="A companion comes first" description="Add a pet, then start their health story with weights, vaccines, vet visits, and medications." action={<Button asChild><Link href="/pets">Manage pets</Link></Button>} /></Card> : <><div className="flex flex-wrap gap-3 items-center mb-6"><label className="field-label m-0" htmlFor="health-pet">Companion</label><select id="health-pet" value={pet.petId} onChange={e => setSelected(e.target.value)} className="h-11 rounded-lg border border-border bg-white px-3 min-w-44">{pets.map(pet => <option key={pet.petId} value={pet.petId}>{pet.name}</option>)}</select><Link href={`/pets/${pet.petId}`} className="subtle-link">Open pet profile →</Link></div><HealthManager key={pet.petId} petId={pet.petId} records={pet.records} initial={initial} /></>}</>;
}
