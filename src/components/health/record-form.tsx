"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { displayWeight, kilograms, todayUTC, type HealthResource, type HealthRecord, type WeightUnit } from "@/lib/health-records";

export const resourceLabels: Record<HealthResource, string> = { weights: "Weight", vaccinations: "Vaccination", "vet-visits": "Vet visit", medications: "Medication" };
type Field = { name: string; label: string; type?: "date" | "number"; optional?: boolean; max?: number; past?: boolean };
const fields: Record<HealthResource, Field[]> = {
  weights: [{ name: "weightKg", label: "Weight", type: "number" }, { name: "recordedAt", label: "Recorded date", type: "date", past: true }],
  vaccinations: [{ name: "name", label: "Vaccine name", max: 160 }, { name: "administeredAt", label: "Administered date", type: "date", past: true }, { name: "nextDueAt", label: "Next due date", type: "date", optional: true }],
  "vet-visits": [{ name: "visitedAt", label: "Visit date", type: "date", past: true }, { name: "clinic", label: "Clinic", max: 200 }, { name: "reason", label: "Reason for visit", max: 300 }],
  medications: [{ name: "name", label: "Medication name", max: 160 }, { name: "dosage", label: "Dosage", max: 200 }, { name: "frequency", label: "Frequency", max: 200 }, { name: "startsAt", label: "Start date", type: "date" }, { name: "endsAt", label: "End date", type: "date", optional: true }],
};
export function RecordForm({ petId, resource, record, onClose, onSaved }: { petId: string; resource: HealthResource; record?: HealthRecord; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [unit, setUnit] = useState<WeightUnit>("kg");
  const [weight, setWeight] = useState(record?.kind === "weights" ? String(record.weightKg) : "");
  const defaults: Record<string, unknown> = record || {};
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget); const body: Record<string, unknown> = {};
    for (const field of fields[resource]) body[field.name] = field.name === "weightKg" ? kilograms(Number(form.get(field.name)), unit) : form.get(field.name) || null;
    body.notes = form.get("notes") || null;
    try {
      const response = await fetch(`/api/pets/${petId}/${resource}${record ? `/${record.id}` : ""}`, { method: record ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to save record.");
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby="health-form-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} className="modal m-auto border-0 backdrop:bg-[#1b2d2666] backdrop:backdrop-blur-sm">
    <div className="flex items-center justify-between mb-2"><h2 id="health-form-title" className="text-xl font-semibold">{record ? "Edit" : "Add"} {resourceLabels[resource].toLowerCase()}</h2><Button type="button" variant="ghost" size="icon" aria-label="Close record form" disabled={busy} onClick={onClose}><X size={18} /></Button></div><p className="mb-6 text-xs text-muted-foreground">A little detail today, a clearer picture tomorrow. Required fields are marked *.</p>
    <form onSubmit={save}><fieldset disabled={busy} className="form-grid">
      {resource === "weights" && <label className="sm:col-span-2"><span className="field-label">Entry unit</span><select className="h-11 rounded-lg border border-border bg-white px-3" value={unit} onChange={e => { const next = e.target.value as WeightUnit; if (weight) setWeight(String(displayWeight(kilograms(Number(weight), unit), next))); setUnit(next); }}><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select></label>}
      {fields[resource].map((field, i) => <label key={field.name}><span className="field-label">{field.label}{field.name === "weightKg" ? ` (${unit})` : ""}{field.optional ? " (optional)" : " *"}</span><Input name={field.name} type={field.type || "text"} autoFocus={i === 0} required={!field.optional} maxLength={field.max} min={field.type === "number" ? "0.01" : undefined} max={field.past ? todayUTC() : undefined} step={field.type === "number" ? "0.01" : undefined} {...(field.name === "weightKg" ? { value: weight, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setWeight(e.target.value) } : { defaultValue: String(defaults[field.name] ?? (field.type === "date" && !field.optional ? todayUTC() : "")) })} /></label>)}
      <label className="sm:col-span-2"><span className="field-label">Notes (optional)</span><textarea name="notes" maxLength={4000} rows={4} defaultValue={record?.notes || ""} className="w-full rounded-lg border border-border p-3 text-sm focus-visible:ring-2 focus-visible:ring-ring" /></label>
    </fieldset>{error && <p role="alert" className="alert mt-5">{error}</p>}<div className="mt-6 flex justify-end gap-3"><Button variant="outline" type="button" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle size={15} className="animate-spin" />}{busy ? "Saving…" : "Save record"}</Button></div></form>
  </dialog>;
}
