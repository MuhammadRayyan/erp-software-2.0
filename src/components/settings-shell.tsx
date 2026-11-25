"use client";

import Link from "next/link";
import React from "react";
import { ChevronLeft } from "lucide-react";
import { usePermissions } from "@/components/permissions-provider";
import { SettingsQuickSwitcher } from "@/components/settings-quick-switcher";

export function SettingsShell({
  businessId,
  title,
  description,
  children,
  maxWidth = "max-w-5xl",
  actions,
  backHref,
  backLabel,
}: {
  businessId: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  const { hasSettingsModule } = usePermissions();
  const resolvedBackHref =
    backHref ?? (hasSettingsModule ? `/b/${businessId}/settings` : `/b/${businessId}/overview`);
  const resolvedBackLabel = backLabel ?? (hasSettingsModule ? "Settings" : "Overview");

  return (
    <div className={`page-container ${maxWidth} space-y-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={resolvedBackHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          {resolvedBackLabel}
        </Link>
        <SettingsQuickSwitcher businessId={businessId} />
      </div>
      <div className="page-header mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">{title}</h1>
          {description && (
            <p className="page-description mt-1 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
