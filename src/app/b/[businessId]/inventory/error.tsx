"use client";
import { SectionError } from "@/components/section-error";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionError label="data" error={error} reset={reset} />;
}
