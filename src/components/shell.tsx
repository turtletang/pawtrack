"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PawPrint, HeartPulse, Pill, Bell, FolderOpen, ChevronRight, Menu, X, LogOut, Leaf, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/auth/actions";
const navigation = [ ["Dashboard", "/dashboard", LayoutDashboard], ["My Pets", "/pets", PawPrint], ["Health Records", "/health-records", HeartPulse], ["Medications", "/medications", Pill], ["Reminders", "/reminders", Bell], ["Documents", "/documents", FolderOpen] ] as const;
export function Brand() { return <Link href="/" className="brand"><span className="brand-mark"><PawPrint size={23} /></span>PawTrack<span className="text-primary text-3xl">.</span></Link>; }
export function Shell({ children, email, preview = false, reminderCount = 0 }: { children: React.ReactNode; email?: string; preview?: boolean; reminderCount?: number }) {
  const pathname = usePathname(); const [open, setOpen] = useState(false);
  const title = preview ? "Dashboard" : navigation.find(n => pathname.startsWith(n[1]))?.[0] || "PawTrack";
  return <div className="shell">
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Main navigation"><Brand />
      <div className="nav-label">YOUR PET&apos;S WORLD</div>
      <nav>{navigation.map(([label, href, Icon], i) => <Link key={href} href={preview ? (i === 0 ? "/preview" : "/login") : href} onClick={() => setOpen(false)} className={`nav-item ${title === label ? "active" : ""}`} aria-current={title === label ? "page" : undefined}><Icon size={18} strokeWidth={1.6} />{label}</Link>)}</nav>
      <div className="side-footer"><div className="care-note"><Leaf size={21} className="text-[#8b9a68]" /><h3 className="mt-3 text-xs font-semibold">A little care goes a long way.</h3><p>Small moments of care.<br />More happy years together.</p></div>
      <div className="profile"><div className="avatar">{preview ? "JD" : email?.slice(0, 1).toUpperCase() || "P"}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{preview ? "Jamie Davis" : email?.split("@")[0] || "Pet owner"}</div><div className="mt-1 text-[10px] text-muted-foreground">{preview ? "Preview account" : "Pet parent"}</div></div>{!preview && <form action={signOut}><button title="Sign out" aria-label="Sign out"><LogOut size={16} /></button></form>}</div></div>
    </aside>
    <header className="topbar"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open}>{open ? <X size={20} /> : <Menu size={20} />}</Button><div className="breadcrumb"><span>Your workspace</span><ChevronRight size={12} /><span className="text-foreground">{title}</span></div></div><div className="flex items-center gap-5"><span className="text-[10px] tracking-wide text-muted-foreground hidden sm:inline">MADE FOR A HEALTHIER, HAPPIER THEM</span><Link href={preview ? "/login" : "/reminders"} className="relative rounded-lg p-2 hover:bg-muted" aria-label={`${reminderCount} care reminders due today or overdue`}><Bell size={18} />{reminderCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-white">{reminderCount > 99 ? "99+" : reminderCount}</span>}</Link><div className="avatar h-8 w-8"><PawPrint size={15} /></div></div></header>
    {preview && <div className="preview-banner"><span className="font-semibold">DESIGN PREVIEW</span><span>Sample pets and care activity · No data is saved</span><Link className="underline flex gap-1 items-center" href="/setup">Connect your project <ArrowUpRight size={12} /></Link></div>}
    <main id="main-content" className="content">{children}<footer><span>© {new Date().getFullYear()} PawTrack</span><span>A little care. A healthier life. ♡</span></footer></main>
  </div>;
}
