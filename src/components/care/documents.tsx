"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { FolderOpen, Upload, FileText, Download, Eye, Trash2, X, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MAX_DOCUMENT_BYTES, type DocumentView } from "@/lib/documents";
export function DocumentManager({ documents, pets, petId }: { documents: DocumentView[]; pets: { id: string; name: string }[]; petId?: string }) {
  const [selectedPet, setSelectedPet] = useState(petId || ""); const [uploading, setUploading] = useState(false); const [preview, setPreview] = useState<DocumentView | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [pending, startTransition] = useTransition(); const router = useRouter();
  const visible = documents.filter(record => !selectedPet || record.petId === selectedPet);
  async function remove(record: DocumentView) {
    if (!window.confirm(`Delete ${record.name}? This removes the private document.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/pets/${record.petId}/documents/${record.id}`, { method: "DELETE" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(data.pending ? "Document hidden. Storage deletion is queued for retry by the cleanup job." : "Document deleted."); startTransition(() => router.refresh());
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to delete document."); } finally { setBusy(false); }
  }
  async function download(record: DocumentView) {
    setBusy(true); setError("");
    try { const response = await fetch(`/api/pets/${record.petId}/documents/${record.id}?download=1`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); const anchor = document.createElement("a"); anchor.href = data.url; anchor.rel = "noopener noreferrer"; anchor.referrerPolicy = "no-referrer"; anchor.click(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to download document."); } finally { setBusy(false); }
  }
  return <section className={petId ? "mt-8" : ""} aria-label="Private medical documents"><div className="page-heading"><div><h1 className={petId ? "text-xl!" : ""}>{petId ? "Medical documents" : "Their records, safely kept"}</h1><p>Private medical files, close at hand when you need them.</p></div><Button disabled={!pets.length} onClick={() => setUploading(true)}><Upload size={15} />Upload</Button></div><div className="flex flex-wrap items-center justify-between gap-3 mb-5"><p className="flex gap-2 text-xs text-muted-foreground items-center"><ShieldCheck size={15} />Private storage · PDF, JPG, PNG, WebP · Up to 10 MB</p>{!petId && <select aria-label="Filter documents by pet" value={selectedPet} onChange={e => setSelectedPet(e.target.value)} className="rounded-lg border border-border bg-white p-2 text-xs"><option value="">All companions</option>{pets.map(pet => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select>}</div>
    {error && <p role="alert" className="alert mb-4">{error}</p>}{message && <p role="status" className="alert success mb-4">{message}</p>}{pending && <p role="status" className="text-xs text-muted-foreground mb-3">Refreshing documents…</p>}
    <Card className="p-5 sm:p-6">{!visible.length ? <div className="empty"><div className="empty-icon"><FolderOpen size={25} /></div><h2>A secure home for their paperwork</h2><p>{pets.length ? "Keep medical reports and care documents together. Upload a file to get started." : "Add a pet before uploading their medical documents."}</p>{!pets.length && <Link href="/pets" className="subtle-link justify-center">Manage pets →</Link>}</div> : <ul className="divide-y divide-border">{visible.map(record => <li key={record.id} className="py-5 first:pt-0 last:pb-0"><div className="flex flex-wrap items-center gap-4"><div className="empty-icon m-0! shrink-0 w-11! h-11!"><FileText size={22} /></div><div className="min-w-0 flex-1"><h2 className="font-semibold break-words">{record.name}</h2><p className="text-xs text-muted-foreground mt-1">{record.petName} · {record.mimeType.split("/")[1].toUpperCase()} · {record.sizeBytes ? `${(record.sizeBytes/1024/1024).toFixed(2)} MB` : "Size not recorded"} · {record.createdAt.slice(0,10)}</p></div><div className="flex gap-1"><Button variant="ghost" size="icon" disabled={busy || pending} aria-label={`Preview ${record.name}`} onClick={() => setPreview(record)}><Eye size={16} /></Button><Button variant="ghost" size="icon" disabled={busy || pending} aria-label={`Download ${record.name}`} onClick={() => download(record)}><Download size={16} /></Button><Button variant="ghost" size="icon" disabled={busy || pending} aria-label={`Delete ${record.name}`} onClick={() => remove(record)}><Trash2 size={15} className="text-[#ad857b]" /></Button></div></div></li>)}</ul>}</Card>
    {uploading && <UploadForm pets={pets} petId={selectedPet || petId} onClose={() => setUploading(false)} onSaved={() => { setUploading(false); setMessage("Your document was securely saved."); startTransition(() => router.refresh()); }} />}{preview && <DocumentPreview record={preview} onClose={() => setPreview(null)} />}
  </section>;
}
function UploadForm({ pets, petId, onClose, onSaved }: { pets: { id: string; name: string }[]; petId?: string; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_DOCUMENT_BYTES) { setError("Choose a nonempty file up to 10 MB."); return; }
    const body = new FormData(); body.set("file", file); setBusy(true); setError("");
    try { const response = await fetch(`/api/pets/${form.get("petId")}/documents`, { method: "POST", body }); const data = await response.json(); if (!response.ok) throw new Error(data.error); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : "Upload failed. Please try again."); } finally { setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby="upload-title" className="modal m-auto border-0 backdrop:bg-[#1b2d2666]" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><div className="flex items-center justify-between mb-5"><h2 id="upload-title" className="text-xl font-semibold">Keep a care document</h2><Button variant="ghost" size="icon" disabled={busy} aria-label="Close upload form" onClick={onClose}><X size={18} /></Button></div><form onSubmit={save}><fieldset disabled={busy} className="space-y-5"><label className="block"><span className="field-label">Companion *</span><select name="petId" defaultValue={petId || pets[0]?.id} className="h-11 w-full rounded-lg border border-border bg-white px-3">{pets.map(pet => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select></label><label className="block rounded-xl border border-dashed border-[#b7c7ab] bg-muted p-6"><span className="field-label flex items-center gap-2"><Upload size={17} />Choose a medical document *</span><input className="mt-3 text-xs w-full" type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp" /><span className="block text-xs text-muted-foreground mt-4">PDF, JPG, PNG, or WebP · Maximum 10 MB. File size and content are checked on the server.</span></label></fieldset>{error && <p role="alert" className="alert mt-4">{error}</p>}<div className="flex justify-end gap-3 mt-6"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy && <LoaderCircle className="animate-spin" size={15} />}{busy ? "Uploading…" : "Upload privately"}</Button></div></form></dialog>;
}
function DocumentPreview({ record, onClose }: { record: DocumentView; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const [url, setUrl] = useState<string | null>(null); const [error, setError] = useState(""); const [expired, setExpired] = useState(false); const [generation, setGeneration] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
    fetch(`/api/pets/${record.petId}/documents/${record.id}`, { cache: "no-store" }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (active) { setUrl(data.url); setError(""); setExpired(false); timer = setTimeout(() => { setUrl(null); setExpired(true); }, data.expiresIn*1000); }
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Preview unavailable."); });
    return () => { active = false; clearTimeout(timer); };
  }, [record.id, record.petId, generation]);
  return <dialog ref={dialog} aria-labelledby="document-preview-title" className="modal m-auto border-0 backdrop:bg-[#1b2d2666]" onCancel={e => { e.preventDefault(); onClose(); }}><div className="flex items-center justify-between gap-3 mb-4"><h2 id="document-preview-title" className="font-semibold break-words">{record.name}</h2><Button variant="ghost" size="icon" aria-label="Close document preview" onClick={onClose}><X size={18} /></Button></div>{error ? <p role="alert" className="alert">{error}</p> : expired ? <p className="text-xs text-muted-foreground py-10">The secure preview link expired.</p> : !url ? <p role="status" className="py-10 text-xs text-muted-foreground">Preparing a private preview…</p> : <>{record.mimeType === "application/pdf" ? <iframe title={record.name} src={url} sandbox="" referrerPolicy="no-referrer" className="h-96 w-full border border-border rounded-lg" /> : <Image src={url} alt={record.name} width={900} height={900} unoptimized className="max-h-[60vh] w-full object-contain rounded-lg" referrerPolicy="no-referrer" />}<a className="subtle-link mt-4" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open secure preview in a new tab →</a><p className="text-[10px] text-muted-foreground mt-3">This private link expires in 60 seconds. PDF previews depend on your browser; use the secure link if needed.</p></>}{(error || expired) && <Button variant="outline" size="sm" className="mt-4" onClick={() => { setError(""); setExpired(false); setGeneration(value => value+1); }}>Refresh secure preview</Button>}</dialog>;
}
