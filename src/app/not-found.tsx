import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() { return <main className="max-w-lg mx-auto px-6 py-24 text-center"><p className="eyebrow">404 · A LITTLE OFF THE TRAIL</p><h1 className="text-3xl mt-4 mb-5">This page wandered off.</h1><Button asChild><Link href="/dashboard">Back to your workspace</Link></Button></main>; }
