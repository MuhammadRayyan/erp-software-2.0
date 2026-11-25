import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getBusinessDb } from "@/core/db/business";
import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { getBusinessAccess } from "@/core/permissions/permissions";

export const savedReportTypes = [
  "profit_loss",
  "balance_sheet",
  "trial_balance",
  "general_ledger",
  "vat_transactions",
  "project_profitability",
] as const;

export type SavedReportType = (typeof savedReportTypes)[number];

export const savedReportInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a report view name").max(80),
  reportType: z.enum(savedReportTypes),
  description: z.string().trim().max(240).optional().default(""),
  config: z.record(z.string(), z.unknown()),
  isShared: z.boolean().optional().default(true),
});

export type SavedReportInput = z.input<typeof savedReportInputSchema>;

export type SavedReportRecord = {
  id: string;
  name: string;
  reportType: SavedReportType;
  description: string | null;
  config: Record<string, unknown>;
  createdBy: string;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
};

const REPORT_TYPE_PATHS: Record<SavedReportType, string> = {
  profit_loss: "/reports/profit-loss",
  balance_sheet: "/reports/balance-sheet",
  trial_balance: "/reports/trial-balance",
  general_ledger: "/reports/general-ledger",
  vat_transactions: "/reports/vat-transactions",
  project_profitability: "/reports/project-profitability",
};

export function buildSavedReportHref(businessId: string, report: SavedReportRecord): string {
  const base = `/b/${businessId}${REPORT_TYPE_PATHS[report.reportType]}`;
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(report.config)) {
    if (val === undefined || val === null || val === "") continue;
    qs.set(key, String(val));
  }
  qs.set("viewId", report.id);
  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}

function mapSavedReportRow(row: {
  id: string;
  name: string;
  report_type: string;
  description: string | null;
  config_json: string;
  created_by: string;
  is_shared: number;
  created_at: string;
  updated_at: string;
}): SavedReportRecord {
  let config: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.config_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      config = parsed as Record<string, unknown>;
    }
  } catch {
    config = {};
  }
  return {
    id: row.id,
    name: row.name,
    reportType: row.report_type as SavedReportType,
    description: row.description,
    config,
    createdBy: row.created_by,
    isShared: Boolean(row.is_shared),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSavedReports(
  businessId: string,
  userId: string,
  reportType?: SavedReportType,
): SavedReportRecord[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = reportType
    ? sqlite
        .prepare(`
          SELECT * FROM saved_reports
          WHERE report_type = ? AND (is_shared = 1 OR created_by = ?)
          ORDER BY updated_at DESC, name ASC
        `)
        .all(reportType, userId)
    : sqlite
        .prepare(`
          SELECT * FROM saved_reports
          WHERE is_shared = 1 OR created_by = ?
          ORDER BY report_type ASC, updated_at DESC, name ASC
        `)
        .all(userId);
  return (rows as Parameters<typeof mapSavedReportRow>[0][]).map(mapSavedReportRow);
}

export function getSavedReport(
  businessId: string,
  userId: string,
  id: string,
): SavedReportRecord | null {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare("SELECT * FROM saved_reports WHERE id = ?")
    .get(id) as Parameters<typeof mapSavedReportRow>[0] | undefined;
  if (!row) return null;
  if (!row.is_shared && row.created_by !== userId) return null;
  return mapSavedReportRow(row);
}

export function saveCustomReportView(
  businessId: string,
  userId: string,
  input: SavedReportInput,
  existingId?: string,
): SavedReportRecord {
  assertMutationPermission(businessId, userId, "reports", "view");
  const data = savedReportInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  if (existingId) {
    const existing = sqlite
      .prepare("SELECT * FROM saved_reports WHERE id = ?")
      .get(existingId) as Parameters<typeof mapSavedReportRow>[0] | undefined;
    if (!existing) throw new Error("Saved report view not found.");
    const access = getBusinessAccess(businessId, userId);
    const isAdmin = access?.membership.role === "administrator";
    if (existing.created_by !== userId && !isAdmin) {
      throw new Error("PERMISSION_DENIED: Only the creator or an administrator can modify this saved view.");
    }
    sqlite
      .prepare(`
        UPDATE saved_reports
        SET name = ?, description = ?, config_json = ?, is_shared = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        data.name,
        data.description || null,
        JSON.stringify(data.config),
        data.isShared ? 1 : 0,
        now,
        existingId,
      );
    return getSavedReport(businessId, userId, existingId)!;
  }

  const id = randomUUID();
  sqlite
    .prepare(`
      INSERT INTO saved_reports (id, name, report_type, description, config_json, created_by, is_shared, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      data.name,
      data.reportType,
      data.description || null,
      JSON.stringify(data.config),
      userId,
      data.isShared ? 1 : 0,
      now,
      now,
    );
  return getSavedReport(businessId, userId, id)!;
}

export function deleteCustomReportView(
  businessId: string,
  userId: string,
  id: string,
): void {
  assertMutationPermission(businessId, userId, "reports", "view");
  const { sqlite } = getBusinessDb(businessId, userId);
  const existing = sqlite
    .prepare("SELECT created_by FROM saved_reports WHERE id = ?")
    .get(id) as { created_by: string } | undefined;
  if (!existing) throw new Error("Saved report view not found.");
  const access = getBusinessAccess(businessId, userId);
  const isAdmin = access?.membership.role === "administrator";
  if (existing.created_by !== userId && !isAdmin) {
    throw new Error("PERMISSION_DENIED: Only the creator or an administrator can delete this saved view.");
  }
  sqlite.prepare("DELETE FROM saved_reports WHERE id = ?").run(id);
}
