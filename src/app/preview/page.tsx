import { Shell } from "@/components/shell";
import { Dashboard, previewPets } from "@/components/dashboard";
export default function PreviewPage() { return <Shell preview><Dashboard pets={previewPets} preview /></Shell>; }
