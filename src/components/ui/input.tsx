import * as React from "react";
import { cn } from "@/lib/cn";
import { textControl } from "./control-styles";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full px-3 text-sm",
        textControl,
        className,
      )}
      {...props}
    />
  );
}
