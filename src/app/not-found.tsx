import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <main className="grid min-h-[70dvh] place-items-center p-6"><div className="max-w-md text-center"><SearchX className="mx-auto size-8 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">Record not found</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">The record may have been removed, archived, or unavailable to your account.</p><Button asChild className="mt-5"><Link href="/businesses">Go to businesses</Link></Button></div></main>;
}
