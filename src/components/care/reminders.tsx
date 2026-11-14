"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Plus, Check, X, CalendarDays, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { reminderState, type ReminderView } from "@/lib/reminders";
import { todayUTC } from "@/lib/health-records";
export function ReminderPreview({ reminders }: { reminders: ReminderView[] }) {
  const pending = reminders.filter(record => record.status === "PENDING");
  return <div>{!pending.length ? <div className="py-9 text-center text-xs text-muted-foreground"><Bell size={24} className="mx-auto mb-3 text-[#99a58d]" />All caught up. Add care tasks in Reminders.</div> : <ul className="divide-y divide-border">{pending.slice(0,4).map(record => <li key={record.id} className="py-3"><Link href="/reminders"><p className="text-xs font-medium break-words">{record.title}</p><p className="text-[10px] text-muted-foreground mt-1">{record.petName} · {record.dueAt} <span className={reminderState(record) === "Overdue" ? "text-[#9c6047]" : ""}>{reminderState(record)}</span></p></Link></li>)}</ul>}<Link href="/reminders" className="subtle-link mt-4 justify-center">Manage reminders →</Link></div>;
}
export function ReminderManager({ reminders, pets }: { reminders: ReminderView[]; pets: { id: string; name: string }[] }) {
  const [filter, setFilter] = useState("Upcoming"); const [pet, setPet] = useState(""); const [creating, setCreating] = useState(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [pending, startTransition] = useTransition(); const router = useRouter();
  const visible = reminders.filter(record => (filter === "All" || reminderState(record) === filter) && (!pet || record.petId === pet));
  async function act(record: ReminderView, status: "COMPLETED" | "DISMISSED") {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/pets/${record.petId}/reminders/${record.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setMessage(status === "COMPLETED" ? "Care task completed." : "Reminder dismissed."); startTransition(() => router.refresh());
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to update reminder."); } finally { setBusy(false); }
  }
  return <><div className="page-heading"><div><h1>A little heads-up</h1><p>Vaccination due dates and everyday care, thoughtfully organized.</p></div><Button onClick={() => setCreating(true)} disabled={!pets.length}><Plus size={15} />Add reminder</Button></div>
    <div className="hero mb-6 min-h-0"><div><span className="eyebrow">CARE WITHOUT THE MENTAL CHECKLIST</span><h2 className="text-xl">Small reminders. More peace of mind.</h2><p>Vaccination reminders are created automatically. Add medication, appointment, or care tasks here. In-app only — no email or SMS.</p></div><Bell size={65} strokeWidth={1} className="ml-auto text-[#a9bc9a] hidden sm:block" /></div>
    <div className="flex flex-wrap gap-2 mb-5">{["Upcoming","Overdue","Completed","Dismissed","All"].map(value => <Button variant={filter === value ? "default" : "outline"} size="sm" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value} <span className="opacity-60 text-[10px]">{reminders.filter(record => value === "All" || reminderState(record) === value).length}</span></Button>)}</div>
    <label className="block mb-5 text-xs text-muted-foreground">Companion <select aria-label="Filter reminders by pet" value={pet} onChange={e => setPet(e.target.value)} className="ml-2 rounded-lg border border-border bg-white p-2"><option value="">All companions</option>{pets.map(pet => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select></label>
    {error && <p role="alert" className="alert mb-4">{error}</p>}{message && <p role="status" className="alert success mb-4">{message}</p>}{pending && <p role="status" className="text-xs text-muted-foreground mb-3">Refreshing reminders…</p>}
    <Card className="p-5 sm:p-6">{!visible.length ? <div className="empty"><div className="empty-icon"><Bell size={24} /></div><h2>No {filter === "All" ? "" : filter.toLowerCase()} reminders</h2><p>{pets.length ? "Add a care task, or record a vaccination with a next due date. Existing vaccinations are reconciled by the scheduled job." : "Add your first pet to start organizing their care."}</p>{!pets.length && <Link href="/pets" className="subtle-link justify-center">Manage pets →</Link>}</div> : <ul className="divide-y divide-border">{visible.map(record => <li key={record.id} className="py-5 first:pt-0 last:pb-0"><div className="flex flex-wrap justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2 items-center"><h2 className="font-semibold break-words">{record.title}</h2><span className={`tag ${reminderState(record) === "Overdue" ? "is-overdue" : ""}`}>{reminderState(record)}</span></div><p className="text-xs text-muted-foreground mt-2"><CalendarDays size={12} className="inline mr-1" />{record.dueAt} · {record.petName} · {record.source === "VACCINATION" ? "Automatic vaccination" : record.category.replaceAll("_", " ").toLowerCase()}</p>{record.notes && <p className="text-xs text-muted-foreground mt-3 whitespace-pre-wrap break-words">{record.notes}</p>}</div>{record.status === "PENDING" && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy || pending} onClick={() => act(record, "COMPLETED")}><Check size={13} />Done</Button><Button size="sm" variant="ghost" disabled={busy || pending} onClick={() => act(record, "DISMISSED")}><X size={13} />Dismiss</Button></div>}</div></li>)}</ul>}</Card>
    {creating && <ReminderForm pets={pets} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setMessage("Your care reminder was saved."); setFilter("All"); startTransition(() => router.refresh()); }} />}
  </>;
}
function ReminderForm({ pets, onClose, onSaved }: { pets: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/pets/${form.get("petId")}/reminders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), dueAt: form.get("dueAt"), category: form.get("category"), notes: form.get("notes") || null }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error); onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save reminder."); } finally { setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby="reminder-form-title" className="modal m-auto border-0 backdrop:bg-[#1b2d2666]" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><div className="flex justify-between items-center mb-5"><h2 id="reminder-form-title" className="text-xl font-semibold">A little care task</h2><Button size="icon" variant="ghost" aria-label="Close reminder form" disabled={busy} onClick={onClose}><X size={18} /></Button></div><form onSubmit={save}><fieldset disabled={busy} className="form-grid"><label><span className="field-label">Companion *</span><select name="petId" className="h-11 w-full rounded-lg border border-border px-3 bg-white">{pets.map(pet => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select></label><label><span className="field-label">Care type *</span><select name="category" className="h-11 w-full rounded-lg border border-border px-3 bg-white"><option value="MEDICATION">Medication</option><option value="VET_APPOINTMENT">Vet appointment</option><option value="OTHER">Other care</option></select></label><label className="sm:col-span-2"><span className="field-label">Title *</span><Input name="title" required maxLength={200} autoFocus placeholder="e.g. Book an annual checkup" /></label><label><span className="field-label">Due date (UTC) *</span><Input name="dueAt" type="date" required defaultValue={todayUTC()} /></label><label className="sm:col-span-2"><span className="field-label">Notes</span><textarea name="notes" rows={3} maxLength={4000} className="w-full rounded-lg border border-border p-3" /></label></fieldset>{error && <p role="alert" className="alert mt-4">{error}</p>}<div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy && <LoaderCircle size={15} className="animate-spin" />}Save reminder</Button></div></form></dialog>;
}
