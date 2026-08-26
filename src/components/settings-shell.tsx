import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import React from "react";

export function SettingsShell({
  businessId,
  title,
  description,
  children,
}: {
  businessId: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page-container max-w-3xl">
      <Link href={`/b/${businessId}/settings`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-description">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
