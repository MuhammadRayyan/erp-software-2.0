import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { controlDisabled, controlFocus, controlInvalid, controlSurface } from "./control-styles";

const WRAPPER_TOKEN_REGEX =
  /^(?:(?:sm|md|lg|xl|2xl):)?(?:w-|min-w-|max-w-|-?m[tblrxy]?-|flex-|shrink|grow|basis-|col-span-|self-|justify-self-|hidden$|inline-flex$|flex$|grid$)/;

function splitSelectClassNames(className?: string) {
  if (!className) {
    return { wrapperClasses: "", hasExplicitWidth: false, hasExplicitRightPad: false, selectClasses: "" };
  }
  const wrapperTokens: string[] = [];
  const selectTokens: string[] = [];
  let hasExplicitWidth = false;
  let hasExplicitRightPad = false;

  for (const token of className.split(/\s+/).filter(Boolean)) {
    if (token === "block") continue;
    if (WRAPPER_TOKEN_REGEX.test(token)) {
      wrapperTokens.push(token);
      if (/^w-/.test(token)) {
        hasExplicitWidth = true;
      }
      if (/^(?:(?:sm|md|lg|xl|2xl):)?(?:min-w-|max-w-)/.test(token)) {
        selectTokens.push(token);
      }
    } else {
      if (/^(?:(?:sm|md|lg|xl|2xl):)?pr-/.test(token)) {
        hasExplicitRightPad = true;
      }
      selectTokens.push(token);
    }
  }

  return {
    wrapperClasses: wrapperTokens.join(" "),
    hasExplicitWidth,
    hasExplicitRightPad,
    selectClasses: selectTokens.join(" "),
  };
}

export interface SelectNativeProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: "sm" | "default";
}

export const SelectNative = React.forwardRef<HTMLSelectElement, SelectNativeProps>(
  ({ className, size = "default", children, ...props }, ref) => {
    const { wrapperClasses, hasExplicitWidth, hasExplicitRightPad, selectClasses } = splitSelectClassNames(className);
    const isAutoWidth = wrapperClasses.split(/\s+/).includes("w-auto");

    return (
      <span
        className={cn(
          "relative inline-flex items-center",
          !hasExplicitWidth && "w-full",
          wrapperClasses,
        )}
      >
        <select
          ref={ref}
          className={cn(
            "appearance-none hover:border-primary/50",
            controlSurface,
            controlFocus,
            controlInvalid,
            controlDisabled,
            isAutoWidth ? "w-auto" : "w-full",
            size === "sm" ? "h-8 pl-2.5 text-xs" : "h-9 pl-3 text-sm",
            selectClasses,
            !hasExplicitRightPad && (size === "sm" ? "pr-7" : "pr-8"),
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground opacity-75",
            size === "sm" ? "right-2 size-3" : "right-2.5 size-3.5",
          )}
        />
      </span>
    );
  },
);
SelectNative.displayName = "SelectNative";
