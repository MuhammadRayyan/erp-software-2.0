import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { MANAGER_CONTENT_TYPES } from "../../src/modules/migration/manager-extractor";

/**
 * Builds a synthetic Manager.io (.manager) backup of configurable size, encoded
 * with the same protobuf-net layout the extractor reads. Used by the
 * event-loop harness and the worker-thread regression tests.
 */

type PbValue = number | string | Buffer | PbField[];
type PbField = [number, PbValue];

function pbVarint(value: number) {
  const bytes: number[] = [];
  let v = BigInt(value);
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    bytes.push(byte);
  } while (v > 0n);
  return Buffer.from(bytes);
}

function pbEncode(fields: PbField[]): Buffer {
  const parts: Buffer[] = [];
  for (const [field, value] of fields) {
    if (typeof value === "number") {
      parts.push(pbVarint(field << 3), pbVarint(value));
      continue;
    }
    const payload = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.isBuffer(value) ? value : pbEncode(value);
    parts.push(pbVarint((field << 3) | 2), pbVarint(payload.length), payload);
  }
  return Buffer.concat(parts);
}

function pbGuid(guid: string): Buffer {
  const hex = guid.replace(/-/g, "");
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32LE(parseInt(hex.slice(0, 8), 16), 0);
  bytes.writeUInt16LE(parseInt(hex.slice(8, 12), 16), 4);
  bytes.writeUInt16LE(parseInt(hex.slice(12, 16), 16), 6);
  Buffer.from(hex.slice(16), "hex").copy(bytes, 8);
  return Buffer.concat([Buffer.from([0x09]), bytes.subarray(0, 8), Buffer.from([0x11]), bytes.subarray(8, 16)]);
}

function pbDecimal(value: string): PbField[] {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const low = Number(`${whole}${fraction}`);
  const fields: PbField[] = [];
  if (low !== 0) fields.push([1, low]);
  if (fraction.length || negative) fields.push([3, (fraction.length << 1) | (negative ? 1 : 0)]);
  return fields;
}

function pbDate(iso: string): PbField[] {
  const days = Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  return [[1, days * 2]];
}

let guidCounter = 0;
const nextGuid = () => {
  guidCounter += 1;
  return `${guidCounter.toString(16).padStart(8, "0")}-0000-4000-8000-${guidCounter.toString(16).padStart(12, "0")}`;
};

function isoDay(index: number) {
  return new Date(Date.UTC(2025, 0, 1) + (index % 360) * 86_400_000).toISOString().slice(0, 10);
}

export type SyntheticManagerOptions = {
  invoices?: number;
  bills?: number;
  receipts?: number;
  customers?: number;
  suppliers?: number;
  linesPerDocument?: number;
};

/** Returns the raw bytes of a .manager SQLite file with the requested volume. */
export function buildSyntheticManagerBackup(options: SyntheticManagerOptions = {}): Buffer {
  const {
    invoices = 100,
    bills = Math.ceil(invoices / 3),
    receipts = Math.ceil(invoices / 2),
    customers = 50,
    suppliers = 20,
    linesPerDocument = 3,
  } = options;
  const M = MANAGER_CONTENT_TYPES;
  const rows: Array<[string, string, Buffer]> = [];
  const add = (type: string, content: Buffer, id = nextGuid()) => {
    rows.push([id, type, content]);
    return id;
  };

  add(M.BUSINESS_DETAILS, pbEncode([[1, "Synthetic Volume Trading LLC"], [2, "Dubai TRN 100000000000003"]]));
  const incomeGroup = add(M.ACCOUNT_GROUPS, pbEncode([[1, "Income"]]));
  const expenseGroup = add(M.ACCOUNT_GROUPS, pbEncode([[1, "Expenses"]]));
  const salesAcct = add(M.CHART_OF_ACCOUNTS, pbEncode([[1, "Workshop Sales"], [3, pbGuid(incomeGroup)]]));
  const expenseAcct = add(M.CHART_OF_ACCOUNTS, pbEncode([[1, "Spare Parts"], [3, pbGuid(expenseGroup)]]));
  const bank = add(M.BANK_AND_CASH_ACCOUNTS, pbEncode([[1, "Main Bank"]]));
  const vat5 = add(M.TAX_CODES, pbEncode([[1, "VAT"], [4, pbDecimal("5")]]));
  const customerIds = Array.from({ length: customers }, (_, i) => add(M.CUSTOMERS, pbEncode([[1, `Customer ${i + 1}`]])));
  const supplierIds = Array.from({ length: suppliers }, (_, i) => add(M.SUPPLIERS, pbEncode([[1, `Supplier ${i + 1}`]])));

  const invoiceIds: string[] = [];
  for (let i = 0; i < invoices; i += 1) {
    const lines: PbField[] = [];
    for (let l = 0; l < linesPerDocument; l += 1) {
      lines.push([49, [[2, pbGuid(salesAcct)], [17, `Service line ${l + 1}`], [18, pbDecimal(String(1 + (l % 3)))], [19, pbDecimal(`${100 + (i % 50)}.25`)], [21, pbGuid(vat5)]]]);
    }
    invoiceIds.push(add(M.SALES_INVOICES_MODERN, pbEncode([
      [1, pbDate(isoDay(i))], [2, `SI-${String(i + 1).padStart(5, "0")}`], [3, pbGuid(customerIds[i % customerIds.length])],
      ...lines,
    ])));
  }
  for (let i = 0; i < bills; i += 1) {
    add(M.PURCHASE_INVOICES_MODERN, pbEncode([
      [1, pbDate(isoDay(i))], [2, `PI-${String(i + 1).padStart(5, "0")}`], [3, pbGuid(supplierIds[i % supplierIds.length])],
      [23, [[2, pbGuid(expenseAcct)], [17, "Parts"], [18, pbDecimal("2")], [19, pbDecimal("40.50")], [21, pbGuid(vat5)]]],
    ]));
  }
  for (let i = 0; i < receipts && i < invoiceIds.length; i += 1) {
    add(M.RECEIPTS_MODERN, pbEncode([
      [1, pbDate(isoDay(i + 5))], [2, `RC-${String(i + 1).padStart(5, "0")}`], [4, pbGuid(customerIds[i % customerIds.length])],
      [7, pbGuid(bank)], [10, "Payment"], [11, [[4, pbGuid(invoiceIds[i])], [18, pbDecimal("50")]]],
    ]));
  }

  const dir = mkdtempSync(path.join(tmpdir(), "synthetic-manager-"));
  const file = path.join(dir, "synthetic.manager");
  const db = new Database(file);
  try {
    db.exec('CREATE TABLE "Objects" (Key TEXT PRIMARY KEY, ContentType TEXT NOT NULL, Content BLOB NOT NULL)');
    const insert = db.prepare('INSERT INTO "Objects" (Key, ContentType, Content) VALUES (?, ?, ?)');
    db.transaction(() => {
      for (const row of rows) insert.run(...row);
    })();
  } finally {
    db.close();
  }
  const buffer = readFileSync(file);
  rmSync(dir, { recursive: true, force: true });
  return buffer;
}
