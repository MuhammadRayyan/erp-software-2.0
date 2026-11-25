"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportCsv, type CsvColumn } from "@/lib/export-csv";
import type { ModuleKey } from "@/core/permissions/module-access";

type ExportCsvButtonProps<T extends Record<string, any> = Record<string, any>> = {
  filename: string;
  columns: CsvColumn<T>[];
  data: T[];
  totalCount?: number;
  label?: string;
  permissionModule?: ModuleKey | ModuleKey[];
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "sm" | "lg" | "icon";
};

export function ExportCsvButton<T extends Record<string, any> = Record<string, any>>({
  filename,
  columns,
  data,
  totalCount,
  label,
  permissionModule,
  className,
  variant = "secondary",
  size = "default",
}: ExportCsvButtonProps<T>) {
  const isTruncated = totalCount != null && totalCount > data.length;
  const buttonLabel = label ?? (isTruncated ? `Export Page (${data.length})` : "Export CSV");
  const title = isTruncated
    ? `Exports the ${data.length} visible rows on this page out of ${totalCount} matching records`
    : "Export to CSV";

  return (
    <Button
      permission="export"
      permissionModule={permissionModule}
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => exportCsv(filename, columns, data)}
      title={title}
      disabled={data.length === 0}
    >
      <Download className="size-3.5" aria-hidden="true" />
      <span>{buttonLabel}</span>
    </Button>
  );
}
