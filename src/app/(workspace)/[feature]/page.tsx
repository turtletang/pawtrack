import { notFound } from "next/navigation";
import { Bell, FolderOpen, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard";
const features = {
  reminders: { title: "Reminders", icon: Bell, description: "Upcoming checkups and care routines, with a little heads-up when you need it." },
  documents: { title: "Documents", icon: FolderOpen, description: "A secure home for medical documents. Private Supabase Storage uploads are planned for a future release." },
};
export default async function FeaturePage({ params }: { params: Promise<{ feature: string }> }) {
  const { feature } = await params;
  const config = features[feature as keyof typeof features];
  if (!config) notFound();
  return <><div className="page-heading"><div><h1>{config.title}</h1><p>Every little detail, thoughtfully organized.</p></div><span className="tag">Planned feature</span></div><Card><EmptyState icon={config.icon} title={`${config.title}, coming soon`} description={config.description} action={<Button asChild variant="outline"><Link href="/pets"><ArrowLeft size={15} />Manage your pets</Link></Button>} /></Card></>;
}
