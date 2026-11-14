"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { WeightChart } from "./weight-chart";
import { Status } from "./health-manager";
import { upcomingCare, vaccinationStatus, type PetHealthView } from "@/lib/health-records";
export function HealthOverview({ pets }: { pets: PetHealthView[] }) {
  const [selected, setSelected] = useState(pets[0]?.petId || "");
  const pet = pets.find(pet => pet.petId === selected) || pets[0]; const care = upcomingCare(pets);
  if (!pet) return null;
  return <section className="mt-7" aria-label="Health dashboard"><div className="section-heading"><h2>A clearer picture of their care</h2><select className="rounded-lg border border-border bg-white p-2 text-xs" aria-label="Pet for weight trend" value={pet.petId} onChange={e => setSelected(e.target.value)}>{pets.map(pet => <option key={pet.petId} value={pet.petId}>{pet.name}</option>)}</select></div><div className="dashboard-grid"><WeightChart key={pet.petId} title={`${pet.name}'s weight trend`} records={pet.records.weights} /><Card className="p-6"><h2 className="font-semibold flex items-center gap-2"><CalendarDays size={17} />Vaccination care ahead</h2><p className="text-xs text-muted-foreground mt-2">Upcoming and overdue · No email notifications</p>{!care.length ? <p className="py-10 text-xs text-muted-foreground text-center">No vaccination due dates recorded yet.</p> : <ul className="mt-4 divide-y divide-border">{care.slice(0,6).map(item => <li key={item.id} className="py-3"><Link href={`/pets/${item.petId}?section=vaccinations`} className="block"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{item.name}</span><Status text={vaccinationStatus(item.due)} /></div><p className="text-xs text-muted-foreground mt-1">{item.petName} · {item.due}</p></Link></li>)}</ul>}<Link href="/health-records" className="subtle-link mt-3">Manage health records →</Link></Card></div></section>;
}
