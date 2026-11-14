"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, PawPrint, Pencil, Trash2, X, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState, PetCard } from "./dashboard";
import type { PetView } from "@/lib/pet-validation";
export function PetManager({ pets }: { pets: PetView[] }) {
  const router = useRouter(); const [editing, setEditing] = useState<PetView | "new" | null>(null);
  const [search, setSearch] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  async function remove(pet: PetView) {
    if (!window.confirm(`Delete ${pet.name}? This permanently deletes their profile and any related records.`)) return;
    setBusy(pet.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/pets/${pet.id}`, { method: "DELETE" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Unable to delete pet."); }
      setMessage(`${pet.name}'s profile was deleted.`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to connect. Please try again."); }
    finally { setBusy(null); }
  }
  const visible = pets.filter(p => `${p.name} ${p.species} ${p.breed || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <><div className="page-heading"><div><h1>Your little companions</h1><p>A home for every pet, and all the details that make them unique.</p></div><Button onClick={() => setEditing("new")}><Plus size={16} />Add a pet</Button></div>
    {error && <p role="alert" className="alert mb-5">{error}</p>}{message && <p role="status" className="alert success mb-5">{message}</p>}
    {pets.length > 0 && <div className="relative mb-6 max-w-sm"><Search size={16} className="absolute left-3 top-3.5 text-muted-foreground" /><Input className="pl-10" aria-label="Search pets" placeholder="Find a companion…" value={search} onChange={e => setSearch(e.target.value)} /></div>}
    {pets.length === 0 ? <Card><EmptyState icon={PawPrint} title="Make room for your first companion" description="A name, a few details, and a whole lot of love. Start your pet's profile to keep their care close." action={<Button onClick={() => setEditing("new")}><Plus size={15} />Add your first pet</Button>} /></Card> : visible.length === 0 ? <Card><EmptyState icon={Search} title="No companions found" description="Try another name, species, or breed." /></Card> : <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">{visible.map(pet => <PetCard key={pet.id} pet={pet} actions={<><Button size="sm" variant="outline" asChild><Link href={`/pets/${pet.id}`}>Health</Link></Button><Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(pet)}><Pencil size={12} />View / edit</Button><Button size="sm" variant="ghost" disabled={busy === pet.id} aria-label={`Delete ${pet.name}`} onClick={() => remove(pet)}>{busy === pet.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} className="text-[#ad857b]" />}</Button></>} />)}</div>}
    {editing && <PetForm pet={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={(name) => { setEditing(null); setMessage(`${name}'s profile was saved.`); router.refresh(); }} />}
  </>;
}
function PetForm({ pet, onClose, onSaved }: { pet?: PetView; onClose: () => void; onSaved: (name: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = { name: form.get("name"), species: form.get("species"), breed: form.get("breed") || null, dateOfBirth: form.get("dateOfBirth") || null,
      sex: form.get("sex") || null, weight: form.get("weight") ? Number(form.get("weight")) : null, photoUrl: form.get("photoUrl") || null };
    try {
      const response = await fetch(pet ? `/api/pets/${pet.id}` : "/api/pets", { method: pet ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save pet.");
      onSaved(data.pet.name);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} aria-labelledby="pet-form-title" className="modal m-auto border-0 backdrop:bg-[#1b2d2666] backdrop:backdrop-blur-sm"><div className="flex justify-between items-center mb-2"><h2 id="pet-form-title" className="text-xl font-semibold">{pet ? `A little about ${pet.name}` : "Meet your new companion"}</h2><Button size="icon" variant="ghost" aria-label="Close pet form" disabled={busy} onClick={onClose}><X size={18} /></Button></div><p className="text-xs text-muted-foreground mb-6">{pet ? "Keep their details up to date." : "Start with the essentials. You can add more details anytime."} Required fields are marked *.</p>
    <form onSubmit={save}><fieldset disabled={busy} className="form-grid"><label><span className="field-label">Name *</span><Input name="name" required maxLength={80} defaultValue={pet?.name} placeholder="e.g. Milo" autoFocus /></label><label><span className="field-label">Species *</span><select name="species" className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm" defaultValue={pet?.species || "Dog"}>{["Dog","Cat","Bird","Rabbit","Other"].map(v => <option key={v}>{v}</option>)}</select></label><label><span className="field-label">Breed</span><Input name="breed" maxLength={100} defaultValue={pet?.breed || ""} placeholder="e.g. Golden Retriever" /></label><label><span className="field-label">Date of birth</span><Input type="date" name="dateOfBirth" max={new Date().toISOString().slice(0,10)} defaultValue={pet?.dateOfBirth || ""} /></label><label><span className="field-label">Sex</span><select name="sex" className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm" defaultValue={pet?.sex || ""}><option value="">Not specified</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="UNKNOWN">Unknown</option></select></label><label><span className="field-label">Weight (kg)</span><Input name="weight" type="number" min="0.01" max="9999.99" step="0.01" defaultValue={pet?.weight || ""} placeholder="e.g. 28.5" /></label><label className="sm:col-span-2"><span className="field-label">Photo URL</span><Input name="photoUrl" type="url" maxLength={2048} pattern="https://.*" defaultValue={pet?.photoUrl || ""} placeholder="https://…" /><span className="block text-[10px] text-muted-foreground mt-2">Optional HTTPS image link. File uploads are planned for a future release.</span></label></fieldset>
    {error && <p role="alert" className="alert mt-5">{error}</p>}<div className="mt-7 flex justify-end gap-3"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle size={15} className="animate-spin" />}{busy ? "Saving…" : pet ? "Save changes" : "Add companion"}</Button></div></form>
  </dialog>;
}
