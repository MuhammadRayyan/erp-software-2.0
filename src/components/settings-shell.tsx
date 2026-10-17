import { BackLink } from "@/components/back-link";
import React from "react";

export function SettingsShell({
  businessId,
  title,
  description,
  children,
  maxWidth = "max-w-4xl",
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
      <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-description">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

