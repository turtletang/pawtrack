"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <main className="max-w-lg mx-auto px-6 py-24"><p className="eyebrow">A LITTLE PAUSE</p><h1 className="text-2xl font-semibold mt-4">Your workspace couldn&apos;t load</h1><p className="text-muted-foreground leading-7 my-5">Please try again in a moment. If the problem continues, return to sign in.</p><div className="flex gap-3"><Button onClick={reset}>Try again</Button><Button asChild variant="outline"><Link href="/login">Back to sign in</Link></Button></div></main>;
}
