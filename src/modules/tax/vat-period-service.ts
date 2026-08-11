import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { parseSignedMoneyToMinor } from "@/modules/accounting/calculations/money";
import { buildVatSnapshot, getVatWorkingPaper } from "./vat-report-service";
import {
  filedExternallyInputSchema,
  reopenPeriodInputSchema,
  vatAdjustmentInputSchema,
  vatPeriodInputSchema,
  type FiledExternallyInput,
  type ReopenPeriodInput,
  type VatAdjustmentInput,
  type VatPeriodInput,
} from "./vat-period-input";

type Sqlite = ReturnType<typeof getBusinessDb>["sqlite"];
type VatPeriodRow = {
  id: string;
  period_reference: string;
  start_date: string;
  end_date: string;
  filing_due_date: string;
  status: string;
  finalized_at: string | null;
  finalized_by: string | null;
  filed_at: string | null;
  filed_by: string | null;
  filing_reference: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function audit(sqlite: Sqlite, periodId: string, action: string, userId: string, reason?: string | null) {
  sqlite.prepare(`
    INSERT INTO vat_period_audit (id, period_id, action, reason_or_reference, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), periodId, action, reason ?? null, userId, new Date().toISOString());
}

function recalculateLock(sqlite: Sqlite) {
  const row = sqlite.prepare(`
    SELECT MAX(end_date) AS lock_date FROM vat_periods
    WHERE status IN ('finalized', 'filed_externally')
  `).get() as { lock_date: string | null };
  sqlite.prepare("UPDATE business_tax_settings SET tax_lock_date = ?, updated_at = ? WHERE id = 'default'")
    .run(row.lock_date, new Date().toISOString());
}

export function listVatPeriods(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const periods = sqlite.prepare("SELECT * FROM vat_periods ORDER BY start_date DESC").all() as VatPeriodRow[];
  return periods.map((period) => {
    const report = getVatWorkingPaper(businessId, userId, String(period.id));
    return { ...period, net_vat_minor: report.netVatMinor, needs_review: report.reviewCount > 0 };
  });
}

export function getVatPeriod(businessId: string, userId: string, periodId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const period = sqlite.prepare("SELECT * FROM vat_periods WHERE id = ?").get(periodId) as Record<string, unknown> | undefined;
  if (!period) return null;
  const auditRows = sqlite.prepare("SELECT * FROM vat_period_audit WHERE period_id = ? ORDER BY created_at DESC").all(periodId) as Record<string, unknown>[];
  const snapshots = sqlite.prepare("SELECT * FROM vat_period_snapshots WHERE period_id = ? ORDER BY created_at DESC").all(periodId) as Record<string, unknown>[];
  return { period, audit: auditRows, snapshots };
}

export function createVatPeriod(businessId: string, userId: string, input: VatPeriodInput) {
  const data = vatPeriodInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    const overlap = sqlite.prepare(`
      SELECT period_reference FROM vat_periods WHERE start_date <= ? AND end_date >= ? LIMIT 1
    `).get(data.endDate, data.startDate) as { period_reference: string } | undefined;
    if (overlap) throw new Error(`VAT period overlaps ${overlap.period_reference}. Use the business's explicit assigned periods.`);
    sqlite.prepare(`
      INSERT INTO vat_periods (
        id, period_reference, start_date, end_date, filing_due_date, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `).run(id, data.periodReference, data.startDate, data.endDate, data.filingDueDate, data.notes || null, now, now);
    audit(sqlite, id, "created", userId, data.notes || null);
  }).immediate();
  return id;
}

export function markVatPeriodPrepared(businessId: string, userId: string, periodId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.transaction(() => {
    const period = sqlite.prepare("SELECT status FROM vat_periods WHERE id = ?").get(periodId) as { status: string } | undefined;
    if (!period || !["open", "reopened", "prepared"].includes(period.status)) throw new Error("Only an Open or Reopened VAT period can be prepared.");
    sqlite.prepare("UPDATE vat_periods SET status = 'prepared', updated_at = ? WHERE id = ?").run(new Date().toISOString(), periodId);
    audit(sqlite, periodId, "prepared", userId);
  }).immediate();
}

export function addVatAdjustment(businessId: string, userId: string, periodId: string, input: VatAdjustmentInput) {
  const data = vatAdjustmentInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.transaction(() => {
    const period = sqlite.prepare("SELECT status FROM vat_periods WHERE id = ?").get(periodId) as { status: string } | undefined;
    if (!period || ["finalized", "filed_externally"].includes(period.status)) throw new Error("Reopen the VAT period before adding an adjustment.");
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO vat_adjustments (
        id, period_id, report_bucket, amount_minor, vat_amount_minor, reason, reference, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), periodId, data.reportBucket, parseSignedMoneyToMinor(data.amount, "Adjustment amount"),
      parseSignedMoneyToMinor(data.vatAmount, "Adjustment VAT"), data.reason, data.reference || null, userId, now);
    audit(sqlite, periodId, "adjustment_added", userId, `${data.reason}${data.reference ? ` (${data.reference})` : ""}`);
  }).immediate();
}

export function finalizeVatPeriod(businessId: string, userId: string, periodId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const snapshot = buildVatSnapshot(businessId, userId, periodId);
  if (snapshot.reviewCount > 0) throw new Error("Resolve the VAT Data Review items in this period before finalizing.");
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    const period = sqlite.prepare("SELECT status FROM vat_periods WHERE id = ?").get(periodId) as { status: string } | undefined;
    if (!period || !["open", "prepared", "reopened"].includes(period.status)) throw new Error("This VAT period cannot be finalized from its current status.");
    sqlite.prepare(`
      INSERT INTO vat_period_snapshots (id, period_id, snapshot_kind, snapshot_json, created_by, created_at)
      VALUES (?, ?, 'finalized', ?, ?, ?)
    `).run(randomUUID(), periodId, JSON.stringify(snapshot), userId, now);
    sqlite.prepare(`
      UPDATE vat_periods SET status = 'finalized', finalized_at = ?, finalized_by = ?, updated_at = ? WHERE id = ?
    `).run(now, userId, now, periodId);
    audit(sqlite, periodId, "finalized", userId);
    recalculateLock(sqlite);
  }).immediate();
}

export function reopenVatPeriod(businessId: string, userId: string, periodId: string, input: ReopenPeriodInput) {
  const data = reopenPeriodInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    const period = sqlite.prepare("SELECT status FROM vat_periods WHERE id = ?").get(periodId) as { status: string } | undefined;
    if (!period || !["finalized", "filed_externally"].includes(period.status)) throw new Error("Only a Finalized or Filed Externally period can be reopened.");
    sqlite.prepare(`
      UPDATE vat_periods SET status = 'reopened', reopened_at = ?, reopened_by = ?, reopen_reason = ?, updated_at = ? WHERE id = ?
    `).run(now, userId, data.reason, now, periodId);
    audit(sqlite, periodId, "reopened", userId, data.reason);
    recalculateLock(sqlite);
  }).immediate();
}

export function markVatPeriodFiledExternally(businessId: string, userId: string, periodId: string, input: FiledExternallyInput) {
  const data = filedExternallyInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    const period = sqlite.prepare("SELECT status FROM vat_periods WHERE id = ?").get(periodId) as { status: string } | undefined;
    if (!period || period.status !== "finalized") throw new Error("Finalize the VAT period before marking it Filed Externally.");
    const finalized = sqlite.prepare(`
      SELECT snapshot_json FROM vat_period_snapshots
      WHERE period_id = ? AND snapshot_kind = 'finalized' ORDER BY created_at DESC LIMIT 1
    `).get(periodId) as { snapshot_json: string } | undefined;
    if (!finalized) throw new Error("The finalized VAT snapshot could not be found.");
    const filedSnapshot = {
      ...(JSON.parse(finalized.snapshot_json) as Record<string, unknown>),
      filedExternally: {
        filedAt: data.filedAt,
        filedBy: userId,
        filingReference: data.filingReference || null,
        recordedAt: now,
        submissionPerformedByErp: false,
      },
    };
    sqlite.prepare(`
      INSERT INTO vat_period_snapshots (id, period_id, snapshot_kind, snapshot_json, created_by, created_at)
      VALUES (?, ?, 'filed_externally', ?, ?, ?)
    `).run(randomUUID(), periodId, JSON.stringify(filedSnapshot), userId, now);
    sqlite.prepare(`
      UPDATE vat_periods SET status = 'filed_externally', filed_at = ?, filed_by = ?,
        filing_reference = ?, updated_at = ? WHERE id = ?
    `).run(data.filedAt, userId, data.filingReference || null, now, periodId);
    audit(sqlite, periodId, "filed_externally", userId, data.filingReference || "Filed outside the ERP");
    recalculateLock(sqlite);
  }).immediate();
}
