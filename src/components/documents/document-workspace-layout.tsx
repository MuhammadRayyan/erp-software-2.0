"use client";

import type { FormEventHandler, ReactNode } from "react";
import { FormError } from "@/components/form-error";
import { cn } from "@/lib/cn";

export interface DocumentWorkspaceLayoutProps {
  banner?: ReactNode;
  serverError?: string | null;
  headerTitle: string;
  headerSubtitle?: string;
  headerBadge?: ReactNode;
  header: ReactNode;
  linesTitle?: string;
  linesSubtitle?: string;
  linesActions?: ReactNode;
  lines: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  footer?: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
}

export function DocumentWorkspaceLayout({
  banner,
  serverError,
  headerTitle,
  headerSubtitle,
  headerBadge,
  header,
  linesTitle = "Line items",
  linesSubtitle,
  linesActions,
  lines,
  bottomLeft,
  bottomRight,
  footer,
  onSubmit,
  className,
}: DocumentWorkspaceLayoutProps) {
  return (
    <form
      onSubmit={onSubmit}
      className={cn("space-y-5 max-w-none", className)}
      noValidate
    >
      {banner}
      {serverError && <FormError message={serverError} />}

      <section className="form-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{headerTitle}</h2>
            {headerSubtitle && (
              <p className="mt-0.5 text-sm text-muted-foreground">{headerSubtitle}</p>
            )}
          </div>
          {headerBadge}
        </div>
        <div className="mt-4">{header}</div>
      </section>

      <section className="form-section">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{linesTitle}</h2>
            {linesSubtitle && (
              <p className="mt-0.5 text-sm text-muted-foreground">{linesSubtitle}</p>
            )}
          </div>
          {linesActions}
        </div>
        {lines}
      </section>

      {(bottomLeft || bottomRight) && (
        <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr] items-start">
          <div className="space-y-4 min-w-0">{bottomLeft}</div>
          <div className="form-section lg:sticky lg:top-20 flex flex-col gap-4">
            {bottomRight}
          </div>
        </section>
      )}

      {footer}
    </form>
  );
}
