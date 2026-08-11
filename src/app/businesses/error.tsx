"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function BusinessesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="page-container max-w-[1050px]"><div className="max-w-xl rounded-lg border border-danger/25 bg-surface-raised p-6"><AlertTriangle className="size-6 text-danger" /><h1 className="mt-4 text-lg font-semibold">Businesses could not be loaded</h1><p className="mt-1.5 text-sm text-muted-foreground">No data was changed. Retry the request to reconnect to the local system database.</p><Button className="mt-5" onClick={reset}>Try again</Button></div></main>; }
