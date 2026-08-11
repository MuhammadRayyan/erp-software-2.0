import { cn } from "@/lib/cn";

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="grid size-8 grid-cols-2 gap-[3px] rounded-[7px] bg-primary p-[7px] shadow-sm" aria-hidden="true">
        <span className="rounded-[1px] bg-primary-foreground/95" />
        <span className="rounded-[1px] bg-primary-foreground/65" />
        <span className="rounded-[1px] bg-primary-foreground/65" />
        <span className="rounded-[1px] bg-primary-foreground/95" />
      </span>
      {!compact && <span className="text-[15px] font-semibold tracking-[-0.02em]">Ledgerly</span>}
    </div>
  );
}
