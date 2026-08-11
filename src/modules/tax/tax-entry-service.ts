import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  directionAllows,
  emirates,
  type Emirate,
  type TaxDirection,
  type VatCategory,
} from "./uae-vat-config";
import { convertToBase } from "@/modules/currency/conversion";
import { getBaseCurrency } from "@/modules/currency/currency";
import type { RateSnapshot } from "@/modules/currency/validation";

export type TaxPostingLine = {
  id: string;
  taxCodeId: string;
  projectId?: string | null;
  netAmountMinor: number;
  taxAmountMinor: number;
};

type TaxDocument = {
  sourceType: "sales_invoice" | "sales_credit_note" | "purchase_invoice" | "bank_transaction";
  sourceId: string;
  sourceNumber: string;
  partyName?: string | null;
  taxDate: string;
  direction: "sales" | "purchases";
  supplyEmirate?: string | null;
  sign?: 1 | -1;
  rate?: RateSnapshot;
};

type TaxCodeRow = {
  id: string;
  name: string;
  rate_basis_points: number;
  direction: TaxDirection;
  vat_category: VatCategory | null;
  is_recoverable: number;
  is_active: number;
};

function taxSettings(sqlite: Database.Database) {
  return sqlite.prepare(`
    SELECT vat_registered, default_supply_emirate
    FROM business_tax_settings WHERE id = 'default'
  `).get() as { vat_registered: number; default_supply_emirate: Emirate | null } | undefined;
}

function insertReview(
  sqlite: Database.Database,
  input: { sourceType: string; sourceId: string; sourceLineId: string; taxDate: string; issueType: string; details: string },
) {
  sqlite.prepare(`
    INSERT OR IGNORE INTO vat_data_review (
      id, source_type, source_id, source_line_id, tax_date, issue_type, details, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(randomUUID(), input.sourceType, input.sourceId, input.sourceLineId, input.taxDate,
    input.issueType, input.details, new Date().toISOString());
}

export function replaceTaxEntries(
  sqlite: Database.Database,
  document: TaxDocument,
  lines: TaxPostingLine[],
) {
  if (!sqlite.inTransaction) throw new Error("Tax-detail posting must run inside a database transaction.");
  const ids = [...new Set(lines.map((line) => line.taxCodeId))];
  const codes = ids.length ? sqlite.prepare(`
    SELECT id, name, rate_basis_points, direction, vat_category, is_recoverable, is_active
    FROM tax_codes WHERE id IN (${ids.map(() => "?").join(", ")})
  `).all(...ids) as TaxCodeRow[] : [];
  const codeById = new Map(codes.map((code) => [code.id, code]));
  if (codes.length !== ids.length) throw new Error("A selected tax code could not be found.");

  const settings = taxSettings(sqlite);
  const explicitEmirate = document.supplyEmirate && emirates.includes(document.supplyEmirate as Emirate)
    ? document.supplyEmirate as Emirate
    : null;
  const supplyEmirate = explicitEmirate ?? settings?.default_supply_emirate ?? null;
  const sign = document.sign ?? 1;
  const now = new Date().toISOString();
  const baseCurrency = getBaseCurrency(sqlite);
  const rate: RateSnapshot = document.rate ?? {
    currencyCode: baseCurrency.code,
    exchangeRateToBase: "1",
    exchangeRateDate: document.taxDate,
    exchangeRateSource: "Base",
    currencyMinorUnit: baseCurrency.minor_unit,
    baseCurrencyCode: baseCurrency.code,
    baseMinorUnit: baseCurrency.minor_unit,
  };

  sqlite.prepare("DELETE FROM tax_entries WHERE source_type = ? AND source_id = ?")
    .run(document.sourceType, document.sourceId);
  sqlite.prepare("DELETE FROM vat_data_review WHERE source_type = ? AND source_id = ?")
    .run(document.sourceType, document.sourceId);

  const insert = sqlite.prepare(`
    INSERT INTO tax_entries (
      id, tax_date, source_type, source_id, source_line_id, source_number, party_name,
      tax_code_id, tax_code_name, rate_basis_points, vat_category, direction,
      net_amount_minor, vat_amount_minor, document_currency, foreign_net_minor,
      foreign_vat_minor, exchange_rate_to_base, base_net_minor, base_vat_minor,
      rate_date, rate_source, output_vat_minor, recoverable_vat_minor,
      supply_emirate, project_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const line of lines) {
    const code = codeById.get(line.taxCodeId)!;
    if (!code.is_active) throw new Error(`Tax code ${code.name} is inactive.`);
    if (!code.vat_category) {
      insertReview(sqlite, {
        sourceType: document.sourceType,
        sourceId: document.sourceId,
        sourceLineId: line.id,
        taxDate: document.taxDate,
        issueType: "missing_classification",
        details: `Tax code ${code.name} has no VAT classification.`,
      });
      throw new Error(`Tax code ${code.name} needs a VAT category before posting.`);
    }
    if (!directionAllows(code.direction, document.direction)) {
      throw new Error(`Tax code ${code.name} cannot be used for ${document.direction}.`);
    }
    if (document.direction === "sales" && code.vat_category === "standard" && !supplyEmirate) {
      if (settings?.vat_registered) {
        throw new Error("Choose the supply Emirate for standard-rated Sales reporting.");
      }
      insertReview(sqlite, {
        sourceType: document.sourceType,
        sourceId: document.sourceId,
        sourceLineId: line.id,
        taxDate: document.taxDate,
        issueType: "missing_emirate",
        details: "Standard-rated Sale has no reviewed supply Emirate.",
      });
    }

    const foreignNetMinor = sign * line.netAmountMinor;
    const foreignVatMinor = sign * line.taxAmountMinor;
    const baseNetMinor = sign * convertToBase(
      line.netAmountMinor, rate.currencyMinorUnit, rate.baseMinorUnit, rate.exchangeRateToBase,
    );
    const baseVatMinor = sign * convertToBase(
      line.taxAmountMinor, rate.currencyMinorUnit, rate.baseMinorUnit, rate.exchangeRateToBase,
    );
    const vatAmountMinor = baseVatMinor;
    const isReverseCharge = code.vat_category === "reverse_charge" && document.direction === "purchases";
    const outputVatMinor = document.direction === "sales" || isReverseCharge ? vatAmountMinor : 0;
    const recoverableVatMinor = document.direction === "purchases" && code.is_recoverable
      ? vatAmountMinor
      : 0;
    insert.run(
      randomUUID(), document.taxDate, document.sourceType, document.sourceId, line.id,
      document.sourceNumber, document.partyName ?? null, code.id, code.name,
      code.rate_basis_points, code.vat_category, document.direction,
      baseNetMinor, vatAmountMinor, rate.currencyCode, foreignNetMinor, foreignVatMinor,
      rate.exchangeRateToBase, baseNetMinor, baseVatMinor, rate.exchangeRateDate,
      rate.exchangeRateSource, outputVatMinor, recoverableVatMinor,
      document.direction === "sales" && code.vat_category === "standard" ? supplyEmirate : null,
      line.projectId ?? null, now,
    );
  }
}

export function reverseTaxEntries(
  sqlite: Database.Database,
  input: { originalSourceType: string; sourceId: string; reversalSourceType: string; taxDate: string },
) {
  if (!sqlite.inTransaction) throw new Error("Tax-detail reversal must run inside a database transaction.");
  const rows = sqlite.prepare(`
    SELECT * FROM tax_entries WHERE source_type = ? AND source_id = ? ORDER BY source_line_id
  `).all(input.originalSourceType, input.sourceId) as Record<string, unknown>[];
  const insert = sqlite.prepare(`
    INSERT INTO tax_entries (
      id, tax_date, source_type, source_id, source_line_id, source_number, party_name,
      tax_code_id, tax_code_name, rate_basis_points, vat_category, direction,
      net_amount_minor, vat_amount_minor, document_currency, foreign_net_minor,
      foreign_vat_minor, exchange_rate_to_base, base_net_minor, base_vat_minor,
      rate_date, rate_source, output_vat_minor, recoverable_vat_minor,
      supply_emirate, project_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  for (const row of rows) {
    insert.run(randomUUID(), input.taxDate, input.reversalSourceType, input.sourceId,
      String(row.source_line_id), String(row.source_number), row.party_name ?? null,
      String(row.tax_code_id), String(row.tax_code_name), Number(row.rate_basis_points),
      String(row.vat_category), String(row.direction), -Number(row.net_amount_minor),
      -Number(row.vat_amount_minor), String(row.document_currency),
      -Number(row.foreign_net_minor), -Number(row.foreign_vat_minor),
      String(row.exchange_rate_to_base), -Number(row.base_net_minor),
      -Number(row.base_vat_minor), String(row.rate_date), String(row.rate_source),
      -Number(row.output_vat_minor),
      -Number(row.recoverable_vat_minor), row.supply_emirate ?? null, row.project_id ?? null, now);
  }
  sqlite.prepare("DELETE FROM vat_data_review WHERE source_type = ? AND source_id = ?")
    .run(input.originalSourceType, input.sourceId);
}
