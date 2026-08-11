import { createHash } from "node:crypto";
import { z } from "zod";
import { parseMoneyToMinor } from "@/modules/accounting/calculations/money";

export const MAX_STATEMENT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_STATEMENT_ROWS = 5_000;

export const csvMappingSchema = z.object({
  date: z.string().min(1),
  valueDate: z.string().optional().default(""),
  description: z.string().min(1),
  reference: z.string().optional().default(""),
  amount: z.string().optional().default(""),
  debit: z.string().optional().default(""),
  credit: z.string().optional().default(""),
  externalId: z.string().optional().default(""),
}).superRefine((value, context) => {
  if (!value.amount && !(value.debit && value.credit)) {
    context.addIssue({ code: "custom", path: ["amount"], message: "Map a signed Amount column or both Debit and Credit columns" });
  }
});

export type CsvMapping = z.infer<typeof csvMappingSchema>;
export type CsvTable = { headers: string[]; rows: string[][]; delimiter: string };

function delimiterFor(firstLine: string) {
  const candidates = [",", ";", "\t"];
  return candidates.map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseCsv(text: string): CsvTable {
  if (!text.trim()) throw new Error("The CSV file is empty.");
  if (Buffer.byteLength(text, "utf8") > MAX_STATEMENT_FILE_BYTES) {
    throw new Error("CSV files may not exceed 2 MB in Phase 5.");
  }
  const normalized = text.replace(/^\uFEFF/, "");
  const delimiter = delimiterFor(normalized.split(/\r?\n/, 1)[0]);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '"') {
      if (quoted && normalized[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && normalized[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error("The CSV contains an unterminated quoted value.");
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one transaction row.");
  if (rows.length - 1 > MAX_STATEMENT_ROWS) throw new Error(`CSV imports are limited to ${MAX_STATEMENT_ROWS} rows.`);
  const headers = rows[0].map((value) => value.trim());
  if (headers.some((header) => !header)) throw new Error("Every mapped CSV column needs a header.");
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
    throw new Error("CSV column headers must be unique.");
  }
  return { headers, rows: rows.slice(1).map((values) => headers.map((_, index) => values[index]?.trim() ?? "")), delimiter };
}

function parseDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !Number.isNaN(Date.parse(`${trimmed}T00:00:00Z`))) return trimmed;
  const match = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(trimmed);
  if (!match) throw new Error(`Invalid statement date: ${trimmed || "blank"}. Use YYYY-MM-DD or DD/MM/YYYY.`);
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) {
    throw new Error(`Invalid statement date: ${trimmed}.`);
  }
  return iso;
}

function parseStatementAmount(value: string, label: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(/,/g, "");
  if (!normalized) return 0;
  const parenthesized = /^\((.*)\)$/.exec(normalized);
  const signed = parenthesized ? `-${parenthesized[1]}` : normalized;
  const sign = signed.startsWith("-") ? -1 : 1;
  const absolute = signed.replace(/^[+-]/, "");
  return sign * parseMoneyToMinor(absolute, label);
}

export type ParsedStatementRow = {
  transactionDate: string;
  valueDate: string | null;
  description: string;
  reference: string | null;
  amountMinor: number;
  externalId: string | null;
};

export function mapCsvRows(table: CsvTable, mappingInput: unknown) {
  const mapping = csvMappingSchema.parse(mappingInput);
  const indexes = Object.fromEntries(Object.entries(mapping).map(([key, header]) => [key, header ? table.headers.indexOf(header) : -1])) as Record<keyof CsvMapping, number>;
  for (const required of ["date", "description"] as const) {
    if (indexes[required] < 0) throw new Error(`Mapped ${required} column was not found in the CSV.`);
  }
  if (mapping.amount && indexes.amount < 0) throw new Error("Mapped Amount column was not found in the CSV.");
  if (!mapping.amount && (indexes.debit < 0 || indexes.credit < 0)) throw new Error("Mapped Debit or Credit column was not found in the CSV.");
  const rows = table.rows.map((row, index): ParsedStatementRow => {
    const transactionDate = parseDate(row[indexes.date]);
    const valueDate = indexes.valueDate >= 0 && row[indexes.valueDate] ? parseDate(row[indexes.valueDate]) : null;
    const description = row[indexes.description].trim();
    if (!description) throw new Error(`Row ${index + 2}: Description is required.`);
    let amountMinor: number;
    if (indexes.amount >= 0) amountMinor = parseStatementAmount(row[indexes.amount], `Row ${index + 2} amount`);
    else {
      const debit = Math.abs(parseStatementAmount(row[indexes.debit], `Row ${index + 2} debit`));
      const credit = Math.abs(parseStatementAmount(row[indexes.credit], `Row ${index + 2} credit`));
      if (debit > 0 && credit > 0) throw new Error(`Row ${index + 2}: Enter either Debit or Credit, not both.`);
      amountMinor = credit - debit;
    }
    if (amountMinor === 0) throw new Error(`Row ${index + 2}: Amount cannot be zero.`);
    return {
      transactionDate, valueDate, description,
      reference: indexes.reference >= 0 ? row[indexes.reference].trim() || null : null,
      amountMinor,
      externalId: indexes.externalId >= 0 ? row[indexes.externalId].trim() || null : null,
    };
  });
  return { mapping, rows };
}

export function statementFingerprint(bankAccountId: string, row: ParsedStatementRow) {
  if (row.externalId) {
    return createHash("sha256").update(`${bankAccountId}\u001fexternal\u001f${row.externalId.trim().toLowerCase()}`).digest("hex");
  }
  const normalizedDescription = row.description.toLowerCase().replace(/\s+/g, " ").trim();
  const reference = row.reference?.toLowerCase().replace(/\s+/g, " ").trim() ?? "";
  return createHash("sha256").update([
    bankAccountId, row.transactionDate, String(row.amountMinor), normalizedDescription,
    reference,
  ].join("\u001f")).digest("hex");
}
