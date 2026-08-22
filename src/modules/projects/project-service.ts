import { cache } from "react";
import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { minorToInput, parseMoneyToMinor } from "@/modules/accounting/calculations/money";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { projectInputSchema, type ProjectInput, type ProjectStatus } from "./project-input";

export type ProjectListRow = {
  id: string;
  code: string;
  name: string;
  customerId: string | null;
  customerName: string | null;
  status: ProjectStatus;
  startDate: string | null;
  targetEndDate: string | null;
  revenueMinor: number;
  costMinor: number;
  profitMinor: number;
};

export function listProjects(businessId: string, userId: string, customerId?: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const values = customerId ? [customerId] : [];
  const rows = sqlite.prepare(`
    WITH actuals AS (
      SELECT jl.project_id,
        COALESCE(SUM(CASE WHEN a.type = 'income' THEN jl.credit_minor - jl.debit_minor ELSE 0 END), 0) AS revenue_minor,
        COALESCE(SUM(CASE WHEN a.type = 'expense' THEN jl.debit_minor - jl.credit_minor ELSE 0 END), 0) AS cost_minor
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
      INNER JOIN accounts a ON a.id = jl.account_id
      WHERE jl.project_id IS NOT NULL AND a.type IN ('income', 'expense')
      GROUP BY jl.project_id
    )
    SELECT p.id, p.code, p.name, p.customer_id, c.name AS customer_name, p.status,
      p.start_date, p.target_end_date,
      COALESCE(actuals.revenue_minor, 0) AS revenue_minor,
      COALESCE(actuals.cost_minor, 0) AS cost_minor
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN actuals ON actuals.project_id = p.id
    ${customerId ? "WHERE p.customer_id = ?" : ""}
    ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'on_hold' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END,
      p.code
  `).all(...values) as {
    id: string; code: string; name: string; customer_id: string | null; customer_name: string | null;
    status: ProjectStatus; start_date: string | null; target_end_date: string | null;
    revenue_minor: number; cost_minor: number;
  }[];
  return rows.map((row): ProjectListRow => ({
    id: row.id,
    code: row.code,
    name: row.name,
    customerId: row.customer_id,
    customerName: row.customer_name,
    status: row.status,
    startDate: row.start_date,
    targetEndDate: row.target_end_date,
    revenueMinor: row.revenue_minor,
    costMinor: row.cost_minor,
    profitMinor: row.revenue_minor - row.cost_minor,
  }));
}

export const listProjectOptions = cache((businessId: string, userId: string) => {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT id, code, name, customer_id, status
    FROM projects
    WHERE is_active = 1 AND status <> 'cancelled'
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'on_hold' THEN 2 ELSE 3 END, code
  `).all() as { id: string; code: string; name: string; customer_id: string | null; status: ProjectStatus }[];
});

export function getProject(businessId: string, userId: string, projectId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite.prepare(`
    WITH actuals AS (
      SELECT jl.project_id,
        SUM(CASE WHEN a.type = 'income' THEN jl.credit_minor - jl.debit_minor ELSE 0 END) AS revenue_minor,
        SUM(CASE WHEN a.type = 'expense' THEN jl.debit_minor - jl.credit_minor ELSE 0 END) AS cost_minor
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
      INNER JOIN accounts a ON a.id = jl.account_id AND a.type IN ('income', 'expense')
      WHERE jl.project_id = ?
      GROUP BY jl.project_id
    )
    SELECT p.*, c.name AS customer_name,
      COALESCE(actuals.revenue_minor, 0) AS revenue_minor,
      COALESCE(actuals.cost_minor, 0) AS cost_minor
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN actuals ON actuals.project_id = p.id
    WHERE p.id = ?
  `).get(projectId, projectId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const revenueMinor = Number(row.revenue_minor);
  const costMinor = Number(row.cost_minor);
  return {
    id: String(row.id), code: String(row.code), name: String(row.name),
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerName: row.customer_name ? String(row.customer_name) : null,
    status: row.status as ProjectStatus,
    description: row.description ? String(row.description) : null,
    startDate: row.start_date ? String(row.start_date) : null,
    targetEndDate: row.target_end_date ? String(row.target_end_date) : null,
    actualEndDate: row.actual_end_date ? String(row.actual_end_date) : null,
    budgetRevenueMinor: row.budget_revenue_minor === null ? null : Number(row.budget_revenue_minor),
    budgetCostMinor: row.budget_cost_minor === null ? null : Number(row.budget_cost_minor),
    managerName: row.manager_name ? String(row.manager_name) : null,
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    revenueMinor, costMinor, profitMinor: revenueMinor - costMinor,
    marginPercent: revenueMinor === 0 ? null : ((revenueMinor - costMinor) / revenueMinor) * 100,
  };
}

function ensureCustomer(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], customerId: string) {
  if (!sqlite.prepare("SELECT 1 FROM customers WHERE id = ?").get(customerId)) throw new Error("Customer not found.");
}

function assertUniqueCode(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], code: string, excludeId?: string) {
  const row = sqlite.prepare(`SELECT id FROM projects WHERE code = ? COLLATE NOCASE${excludeId ? " AND id <> ?" : ""}`).get(...(excludeId ? [code, excludeId] : [code]));
  if (row) throw new Error("Project code already exists.");
}

function budgetValue(value: string) {
  return value ? parseMoneyToMinor(value, "Budget") : null;
}

export function createProject(businessId: string, userId: string, input: ProjectInput) {
  const data = projectInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  if (data.customerId) ensureCustomer(sqlite, data.customerId);
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    const code = data.code || allocateNumber(sqlite, "project");
    assertUniqueCode(sqlite, code);
    sqlite.prepare(`
      INSERT INTO projects (
        id, code, name, customer_id, status, description, start_date, target_end_date,
        actual_end_date, budget_revenue_minor, budget_cost_minor, manager_name,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, code, data.name, data.customerId || null, data.status, data.description || null,
      data.startDate || null, data.targetEndDate || null, data.actualEndDate || null,
      budgetValue(data.budgetRevenue), budgetValue(data.budgetCost), data.managerName || null,
      data.status === "cancelled" ? 0 : 1, now, now);
  }).immediate();
  return id;
}

export function updateProject(businessId: string, userId: string, projectId: string, input: ProjectInput) {
  const data = projectInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const current = sqlite.prepare("SELECT id, code FROM projects WHERE id = ?").get(projectId) as { id: string; code: string } | undefined;
  if (!current) throw new Error("Project not found.");
  if (data.customerId) ensureCustomer(sqlite, data.customerId);
  const code = data.code || current.code;
  assertUniqueCode(sqlite, code, projectId);
  if (data.customerId) {
    const mismatch = sqlite.prepare(`
      SELECT 1 FROM (
        SELECT customer_id FROM sales_invoices i WHERE i.project_id = ? OR EXISTS (
          SELECT 1 FROM sales_invoice_lines l WHERE l.invoice_id = i.id AND l.project_id = ?)
        UNION ALL
        SELECT customer_id FROM sales_credit_notes n WHERE n.project_id = ? OR EXISTS (
          SELECT 1 FROM sales_credit_note_lines l WHERE l.credit_note_id = n.id AND l.project_id = ?)
      ) linked WHERE customer_id <> ? LIMIT 1
    `).get(projectId, projectId, projectId, projectId, data.customerId);
    if (mismatch) throw new Error("Selected project belongs to a different customer.");
  }
  sqlite.prepare(`
    UPDATE projects SET code = ?, name = ?, customer_id = ?, status = ?, description = ?,
      start_date = ?, target_end_date = ?, actual_end_date = ?, budget_revenue_minor = ?,
      budget_cost_minor = ?, manager_name = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `).run(code, data.name, data.customerId || null, data.status, data.description || null,
    data.startDate || null, data.targetEndDate || null, data.actualEndDate || null,
    budgetValue(data.budgetRevenue), budgetValue(data.budgetCost), data.managerName || null,
    data.status === "cancelled" ? 0 : 1, new Date().toISOString(), projectId);
}

export function projectToInput(project: NonNullable<ReturnType<typeof getProject>>): ProjectInput {
  return {
    code: project.code,
    name: project.name,
    customerId: project.customerId ?? "",
    status: project.status,
    description: project.description ?? "",
    startDate: project.startDate ?? "",
    targetEndDate: project.targetEndDate ?? "",
    actualEndDate: project.actualEndDate ?? "",
    budgetRevenue: project.budgetRevenueMinor === null ? "" : minorToInput(project.budgetRevenueMinor),
    budgetCost: project.budgetCostMinor === null ? "" : minorToInput(project.budgetCostMinor),
    managerName: project.managerName ?? "",
  };
}

export function deleteProject(businessId: string, userId: string, projectId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  if (!sqlite.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) throw new Error("Project not found.");
  const linked = sqlite.prepare(`
    SELECT 1 FROM (
      SELECT project_id FROM sales_invoices WHERE project_id = ?
      UNION ALL SELECT project_id FROM sales_invoice_lines WHERE project_id = ?
      UNION ALL SELECT project_id FROM sales_credit_notes WHERE project_id = ?
      UNION ALL SELECT project_id FROM sales_credit_note_lines WHERE project_id = ?
      UNION ALL SELECT project_id FROM purchase_orders WHERE project_id = ?
      UNION ALL SELECT project_id FROM purchase_order_lines WHERE project_id = ?
      UNION ALL SELECT project_id FROM purchase_invoices WHERE project_id = ?
      UNION ALL SELECT project_id FROM purchase_invoice_lines WHERE project_id = ?
      UNION ALL SELECT project_id FROM goods_receipts WHERE project_id = ?
      UNION ALL SELECT project_id FROM goods_receipt_lines WHERE project_id = ?
      UNION ALL SELECT project_id FROM delivery_notes WHERE project_id = ?
      UNION ALL SELECT project_id FROM delivery_note_lines WHERE project_id = ?
      UNION ALL SELECT project_id FROM stock_adjustments WHERE project_id = ?
      UNION ALL SELECT project_id FROM inventory_movements WHERE project_id = ?
      UNION ALL SELECT project_id FROM bank_transaction_lines WHERE project_id = ?
      UNION ALL SELECT project_id FROM journal_lines WHERE project_id = ?
      UNION ALL SELECT project_id FROM project_notes WHERE project_id = ?
      UNION ALL SELECT project_id FROM project_attachments WHERE project_id = ?
    ) LIMIT 1
  `).get(...Array(18).fill(projectId));
  if (linked) throw new Error("Cannot delete this project because it has related documents or activity.");
  sqlite.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
}
