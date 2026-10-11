import * as React from "react";
import { cn } from "@/lib/cn";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, rows = 2, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "w-full rounded-[6px] border border-border-strong bg-surface-raised px-3 py-2 text-sm text-foreground shadow-[0_1px_1px_rgb(15_23_42/0.03)] outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 resize-y",
        className,
      )}
      {...props}
    />
  );
}
