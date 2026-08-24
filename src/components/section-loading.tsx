import { Loader2 } from "lucide-react";

export function SectionLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <span className="ml-2 text-sm text-muted-foreground">Loading {label}…</span>
    </div>
  );
}
