import * as React from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm text-foreground shadow-[0_1px_1px_rgb(15_23_42/0.03)] outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/25 aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/25 aria-invalid:bg-danger/[0.03] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 transition-colors",
        className,
      )}
      {...props}
    />
  );
}
