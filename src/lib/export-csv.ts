/**
 * Core utility for exporting arrays of objects to a CSV file on the client side.
 */

export type CsvColumn<T> = {
  header: string;
  accessorFn: (row: T) => string | number | boolean | null | undefined;
};

function escapeCsvCell(cell: any): string {
  if (cell === null || cell === undefined) return "";
  const str = String(cell);
  // If it contains quotes, commas, or newlines, enclose in quotes and double the internal quotes.
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportCsv<T>(filename: string, columns: CsvColumn<T>[], data: T[]) {
  const headers = columns.map((col) => escapeCsvCell(col.header)).join(",");
  const rows = data.map((row) => columns.map((col) => escapeCsvCell(col.accessorFn(row))).join(","));
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
