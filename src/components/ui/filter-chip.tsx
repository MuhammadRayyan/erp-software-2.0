import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function FilterChip({
  children,
  className,
  onRemove,
}: {
  children: React.ReactNode;
  className?: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2.5 text-xs", className)}
      onClick={onRemove}
    >
      {children} <X aria-hidden="true" className="size-3" />
    </button>
  );
}
