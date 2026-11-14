"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard";
import { RecordForm, resourceLabels } from "./record-form";
import { WeightChart } from "./weight-chart";
import { resources, medicationStatus, vaccinationStatus, displayWeight, recordDate, type HealthBundle, type HealthRecord, type HealthResource, type WeightUnit } from "@/lib/health-records";

export function HealthManager({ petId, records, initial = "weights" }: { petId: string; records: HealthBundle; initial?: HealthResource }) {
  const router = useRouter(); const [resource, setResource] = useState(initial); const [editing, setEditing] = useState<HealthRecord | "new" | null>(null);
  const [busy, setBusy] = useState(false); const [refreshing, startTransition] = useTransition(); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("All"); const [unit, setUnit] = useState<WeightUnit>("kg");
  const list: HealthRecord[] = resource === "vet-visits" ? records.vetVisits : records[resource];
  const visible = list.filter(record => filter === "All" || (record.kind === "medications" ? medicationStatus(record) === filter : record.kind === "vaccinations" ? vaccinationStatus(record.nextDueAt) === filter : true));
  function refresh(text: string) { setMessage(text); setError(""); startTransition(() => router.refresh()); }
  async function remove(record: HealthRecord) {
    if (!window.confirm(`Permanently delete this ${resourceLabels[record.kind].toLowerCase()} record?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/pets/${petId}/${record.kind}/${record.id}`, { method: "DELETE" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Unable to delete record."); }
      refresh("The health record was deleted.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to connect. Please try again."); } finally { setBusy(false); }
  }
  return <section aria-label="Pet health records" className="space-y-5">
    <nav aria-label="Health record sections" className="flex gap-2 overflow-x-auto pb-2">{resources.map(value => <Button key={value} variant={resource === value ? "default" : "outline"} aria-pressed={resource === value} onClick={() => { setResource(value); setFilter("All"); }}>{resourceLabels[value]}{value === "weights" ? " history" : "s"}</Button>)}</nav>
    {resource === "weights" && <WeightChart records={records.weights} />}
    <Card className="p-5 sm:p-6"><div className="flex flex-wrap justify-between items-center gap-3 mb-5"><div><h2 className="text-base font-semibold">{resourceLabels[resource]} records <span className="text-muted-foreground font-normal text-xs">({list.length})</span></h2><p className="text-xs text-muted-foreground mt-1">Most recent first · Dates use UTC calendar days</p></div><Button size="sm" onClick={() => setEditing("new")} disabled={busy || refreshing}><Plus size={14} />Add record</Button></div>
      <div className="flex gap-2 mb-4">{resource === "weights" && <select className="border border-border rounded-lg bg-white p-2 text-xs" aria-label="Weight list unit" value={unit} onChange={e => setUnit(e.target.value as WeightUnit)}><option value="kg">kg</option><option value="lb">lb</option></select>}{(resource === "medications" || resource === "vaccinations") && <select className="border border-border rounded-lg bg-white p-2 text-xs" aria-label="Filter health records" value={filter} onChange={e => setFilter(e.target.value)}>{(resource === "medications" ? ["All", "Active", "Scheduled", "Historical"] : ["All", "Overdue", "Due today", "Upcoming", "No due date"]).map(value => <option key={value}>{value}</option>)}</select>}</div>
      {error && <p className="alert mb-4" role="alert">{error}</p>}{message && <p className="alert success mb-4" role="status">{message}</p>}{refreshing && <p className="text-xs text-muted-foreground mb-3" role="status">Refreshing health records…</p>}
      {!visible.length ? <EmptyState icon={HeartPulse} title={list.length ? "No matching records" : "Every little detail matters"} description={list.length ? "Choose another filter to see more of their care history." : `Add their first ${resourceLabels[resource].toLowerCase()} record to start tracking their care.`} /> : <ul className="divide-y divide-border">{visible.map(record => <li key={record.id} className="py-5 first:pt-0 last:pb-0"><div className="flex justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold break-words">{record.kind === "weights" ? `${displayWeight(record.weightKg, unit)} ${unit}` : record.kind === "vet-visits" ? record.clinic : record.name}</h3>{record.kind === "vaccinations" && <Status text={vaccinationStatus(record.nextDueAt)} />}{record.kind === "medications" && <Status text={medicationStatus(record)} />}</div><p className="mt-1 text-xs text-muted-foreground">{recordDate(record)}{record.kind === "vaccinations" && record.nextDueAt ? ` · Next due ${record.nextDueAt}` : ""}{record.kind === "medications" && record.endsAt ? ` → ${record.endsAt}` : ""}</p>{record.kind === "vet-visits" && <p className="text-sm mt-2 break-words">{record.reason || "Reason not recorded"}</p>}{record.kind === "medications" && <p className="text-sm mt-2 break-words">{record.dosage} · {record.frequency || "Frequency not recorded"}</p>}{record.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words mt-3 leading-6">{record.notes}</p>}</div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon" disabled={busy || refreshing} onClick={() => setEditing(record)} aria-label={`Edit ${resourceLabels[resource]} on ${recordDate(record)}`}><Pencil size={14} /></Button><Button variant="ghost" size="icon" disabled={busy || refreshing} onClick={() => remove(record)} aria-label={`Delete ${resourceLabels[resource]} on ${recordDate(record)}`}><Trash2 size={14} className="text-[#ad857b]" /></Button></div></div></li>)}</ul>}
    </Card>{editing && <RecordForm petId={petId} resource={resource} record={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh("The health record was saved."); }} />}
  </section>;
}
export function Status({ text }: { text: string }) { return <span className={`tag ${text === "Overdue" ? "is-overdue" : ""}`}>{text}</span>; }
