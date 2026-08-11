"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="page-container"><div className="max-w-xl rounded-lg border border-danger/25 bg-surface-raised p-6"><AlertTriangle className="size-6 text-danger" /><h1 className="mt-4 text-lg font-semibold">This page could not be loaded</h1><p className="mt-1.5 text-sm text-muted-foreground">Your data was not changed. Retry the request, or return to the business list if the issue continues.</p><Button className="mt-5" onClick={reset}>Try again</Button></div></div>; }
