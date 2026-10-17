import * as React from "react";
import { cn } from "@/lib/cn";

export function SelectNative({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/25 aria-invalid:bg-danger/[0.03] disabled:cursor-not-allowed disabled:opacity-60 transition-colors",
        className
      )}
      {...props}
    />
  );
}

