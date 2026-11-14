"use client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="rounded-2xl border bg-white p-10"><h1 className="text-xl font-semibold">Your workspace couldn&apos;t load</h1><p className="my-4 text-muted-foreground">Please try again. If this is a new installation, check your database connection and apply migrations.</p><div className="flex gap-3"><Button onClick={reset}>Try again</Button><Button variant="outline" asChild><Link href="/setup">Setup guide</Link></Button></div></div>;
}
