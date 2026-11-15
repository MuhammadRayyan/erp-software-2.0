import Link from "next/link";
import React from "react";
import { ChevronLeft } from "lucide-react";

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
    <div className={`page-container ${maxWidth} space-y-5`}>
      <Link
        href={`/b/${businessId}/settings`}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        Settings
      </Link>
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
