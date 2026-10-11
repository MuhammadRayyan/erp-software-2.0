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
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-muted/60 px-2.5 text-xs text-foreground transition-colors hover:bg-surface-muted hover:border-border-strong",
        className
      )}
      onClick={onRemove}
    >
      <span>{children}</span>
      <X aria-hidden="true" className="size-3 text-muted-foreground group-hover:text-foreground shrink-0" />
    </button>
  );
}
