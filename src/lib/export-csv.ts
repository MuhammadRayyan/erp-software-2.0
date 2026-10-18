import { escapeCsvCell } from "./csv-utils";

export { escapeCsvCell, formatCsv } from "./csv-utils";

export type CsvColumn<T = any> = {
  header: string;
  accessorKey?: string;
  accessorFn?: (row: T) => string | number | boolean | null | undefined;
};

export function exportCsv<T extends Record<string, any>>(filename: string, columns: CsvColumn<T>[], data: T[]) {
  const headers = columns.map((col) => escapeCsvCell(col.header)).join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const val = col.accessorFn
          ? col.accessorFn(row)
          : col.accessorKey
          ? row[col.accessorKey]
          : "";
        return escapeCsvCell(val);
      })
      .join(",")
  );
  const csvContent = [headers, ...rows].join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" }); // BOM for Excel UTF-8
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Cleanup
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
