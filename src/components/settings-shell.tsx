import { BackLink } from "@/components/back-link";
import React from "react";

export function SettingsShell({
  businessId,
  title,
  description,
  children,
  maxWidth = "max-w-5xl",
  actions,
}: {
  businessId: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`page-container ${maxWidth} space-y-6`}>
      <BackLink href={`/b/${businessId}/settings`}>Settings</BackLink>
      <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="page-title text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && <p className="page-description mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

