/**
 * Core utility for sanitizing and formatting CSV data, with OWASP formula injection protection.
 */

export function escapeCsvCell(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? String(cell) : "";
  }
  let str = String(cell);
  // Protect against CSV formula injection (OWASP CWE-1236) while keeping pure
  // signed numbers (e.g. "-125.00") numeric so Excel SUM() and charts work.
  const isPureSignedNumber = /^-?\d+(?:\.\d+)?$/.test(str);
  if (!isPureSignedNumber && /^[\s\r\n]*[=+@\t\r\n]|^[\s\r\n]*-(?!\d+(?:\.\d+)?$)/.test(str)) {
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
