"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportCsv, type CsvColumn } from "@/lib/export-csv";

type ExportCsvButtonProps<T extends Record<string, any> = Record<string, any>> = {
  filename: string;
  columns: CsvColumn<T>[];
  data: T[];
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function ExportCsvButton<T extends Record<string, any> = Record<string, any>>({
  filename,
  columns,
  data,
  className,
  variant = "secondary",
}: ExportCsvButtonProps<T>) {
  return (
    <Button
      variant={variant}
      className={className}
      onClick={() => exportCsv(filename, columns, data)}
      title="Export to CSV"
      disabled={data.length === 0}
    >
      <Download className="mr-2 size-4" />
      Export CSV
    </Button>
  );
}
