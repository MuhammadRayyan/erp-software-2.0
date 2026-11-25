import * as React from "react";
import { cn } from "@/lib/cn";
import { textControl } from "./control-styles";

export type TextareaProps = React.ComponentProps<"textarea">;

export function Textarea({ className, rows = 2, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "w-full px-3 py-2 text-sm resize-y",
        textControl,
        className,
      )}
      {...props}
    />
  );
}
