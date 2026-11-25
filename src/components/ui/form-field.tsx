"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";
import { fieldErrorId } from "@/lib/form-errors";

export interface FormFieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  optional = false,
  hint,
  error,
  className,
  children,
}: FormFieldProps) {
  const errorId = htmlFor ? fieldErrorId(htmlFor) : undefined;
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  // Link the control to its hint/error so assistive tech announces them.
  const control =
    describedBy && React.isValidElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean }>(children)
      ? React.cloneElement(children, {
          "aria-describedby": children.props["aria-describedby"] ?? describedBy,
          "aria-invalid": children.props["aria-invalid"] ?? (error ? true : undefined),
        })
      : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
        {!required && optional ? (
          <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
        ) : null}
      </Label>
      {control}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
