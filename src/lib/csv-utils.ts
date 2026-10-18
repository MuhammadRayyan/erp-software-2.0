/**
 * Core utility for sanitizing and formatting CSV data, with OWASP formula injection protection.
 */

export function escapeCsvCell(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  let str = String(cell);
  // Protect against CSV formula injection (OWASP recommendation / CWE-1236)
  // Prefixes formula triggers (=, +, -, @, \t, \r) with a single quote.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // If it contains quotes, commas, or newlines, enclose in quotes and double internal quotes.
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}
