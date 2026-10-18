import { cache } from "react";
import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { minorToInput, parseMoneyToMinor } from "@/modules/accounting/calculations/money";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import {
  projectInputSchema,
  projectCustomerInputSchema,
  type ProjectInput,
  type ProjectStatus,
  type ProjectCustomerRole,
  type ProjectCustomerInput,
} from "./project-input";

export type ProjectListRow = {
  id: string;
  code: string;
  name: string;
  customerId: string | null;
  customerName: string | null;
  coClientCount: number;
  coClientNames: string | null;
  customerRole: ProjectCustomerRole | null;
  status: ProjectStatus;
  startDate: string | null;
  targetEndDate: string | null;
  revenueMinor: number;
  costMinor: number;
  profitMinor: number;
};

export type ProjectCustomerSummary = {
  id: string;
  projectId: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  role: ProjectCustomerRole;
  billingPercentage: number | null;
  isPrimary: boolean;
  notes: string | null;
  invoicedMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  createdAt: string;
};

export function listProjects(businessId: string, userId: string, customerId?: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const values = customerId ? [customerId, customerId, customerId] : [];
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
      COALESCE(actuals.cost_minor, 0) AS cost_minor,
      COALESCE((
        SELECT COUNT(DISTINCT pc.customer_id)
        FROM project_customers pc
        WHERE pc.project_id = p.id AND (p.customer_id IS NULL OR pc.customer_id <> p.customer_id)
      ), 0) AS co_client_count,
      (
        SELECT GROUP_CONCAT(c2.name, ', ')
        FROM project_customers pc2
        INNER JOIN customers c2 ON c2.id = pc2.customer_id
        WHERE pc2.project_id = p.id AND (p.customer_id IS NULL OR pc2.customer_id <> p.customer_id)
      ) AS co_client_names,
      ${customerId ? `(
        SELECT pc3.role
        FROM project_customers pc3
        WHERE pc3.project_id = p.id AND pc3.customer_id = ?
        LIMIT 1
      )` : "NULL"} AS customer_role
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN actuals ON actuals.project_id = p.id
    ${customerId ? `
      WHERE (
        p.customer_id = ?
        OR EXISTS (SELECT 1 FROM project_customers pc WHERE pc.project_id = p.id AND pc.customer_id = ?)
      )
    ` : ""}
    ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'on_hold' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END,
      p.code
  `).all(...values) as {
    id: string; code: string; name: string; customer_id: string | null; customer_name: string | null;
    status: ProjectStatus; start_date: string | null; target_end_date: string | null;
    revenue_minor: number; cost_minor: number;
    co_client_count: number; co_client_names: string | null; customer_role: ProjectCustomerRole | null;
  }[];
  return rows.map((row): ProjectListRow => ({
    id: row.id,
    code: row.code,
    name: row.name,
    customerId: row.customer_id,
    customerName: row.customer_name,
    coClientCount: Number(row.co_client_count || 0),
    coClientNames: row.co_client_names,
    customerRole: row.customer_role,
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
  const rows = sqlite.prepare(`
    SELECT p.id, p.code, p.name, p.customer_id, p.status,
      (
        SELECT GROUP_CONCAT(DISTINCT pc.customer_id)
        FROM project_customers pc
        WHERE pc.project_id = p.id
      ) AS associated_customer_ids
    FROM projects p
    WHERE p.is_active = 1 AND p.status <> 'cancelled'
    ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'on_hold' THEN 2 ELSE 3 END, p.code
  `).all() as {
    id: string;
    code: string;
    name: string;
    customer_id: string | null;
    status: ProjectStatus;
    associated_customer_ids: string | null;
  }[];

  return rows.map((r) => {
    const set = new Set<string>();
    if (r.customer_id) set.add(r.customer_id);
    if (r.associated_customer_ids) {
      for (const cid of r.associated_customer_ids.split(",")) {
        if (cid.trim()) set.add(cid.trim());
      }
    }
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      customerId: r.customer_id,
      customer_id: r.customer_id,
      customerIds: Array.from(set),
      status: r.status,
    };
  });
});

export function listProjectCustomers(businessId: string, userId: string, projectId: string): ProjectCustomerSummary[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite.prepare(`
    WITH customer_invoices AS (
      SELECT 
        i.customer_id,
        COALESCE(SUM(l.net_amount_minor), 0) AS invoiced_net_minor,
        COALESCE(SUM(l.gross_amount_minor), 0) AS invoiced_gross_minor
      FROM sales_invoices i
      INNER JOIN sales_invoice_lines l ON l.invoice_id = i.id
      WHERE i.document_status = 'posted' AND (COALESCE(l.project_id, i.project_id) = ?)
      GROUP BY i.customer_id
    ),
    customer_receipts AS (
      SELECT 
        i.customer_id,
        COALESCE(SUM(ra.base_carrying_amount_released), 0) AS collected_minor
      FROM receipt_allocations ra
      INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
      INNER JOIN sales_invoices i ON i.id = ra.sales_invoice_id
      WHERE (i.project_id = ? OR EXISTS (SELECT 1 FROM sales_invoice_lines l WHERE l.invoice_id = i.id AND l.project_id = ?))
      GROUP BY i.customer_id
    )
    SELECT 
      pc.id, pc.project_id, pc.customer_id, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
      pc.role, pc.billing_percentage, pc.is_primary, pc.notes, pc.created_at,
      COALESCE(ci.invoiced_gross_minor, 0) AS invoiced_minor,
      COALESCE(cr.collected_minor, 0) AS collected_minor
    FROM project_customers pc
    INNER JOIN customers c ON c.id = pc.customer_id
    LEFT JOIN customer_invoices ci ON ci.customer_id = pc.customer_id
    LEFT JOIN customer_receipts cr ON cr.customer_id = pc.customer_id
    WHERE pc.project_id = ?
    ORDER BY pc.is_primary DESC, pc.role, c.name
  `).all(projectId, projectId, projectId, projectId) as {
    id: string;
    project_id: string;
    customer_id: string;
    customer_name: string;
    customer_email: string | null;
    customer_phone: string | null;
    role: ProjectCustomerRole;
    billing_percentage: number | null;
    is_primary: number;
    notes: string | null;
    created_at: string;
    invoiced_minor: number;
    collected_minor: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    role: r.role,
    billingPercentage: r.billing_percentage,
    isPrimary: Boolean(r.is_primary),
    notes: r.notes,
    invoicedMinor: r.invoiced_minor,
    collectedMinor: r.collected_minor,
    outstandingMinor: Math.max(0, r.invoiced_minor - r.collected_minor),
    createdAt: r.created_at,
  }));
}

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
  const customers = listProjectCustomers(businessId, userId, projectId);
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
    customers,
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

    if (data.customerId) {
      sqlite.prepare(`
        INSERT OR IGNORE INTO project_customers (
          id, project_id, customer_id, role, billing_percentage, is_primary, notes, created_at, updated_at
        ) VALUES (?, ?, ?, 'primary_client', NULL, 1, 'Primary Client', ?, ?)
      `).run(randomUUID(), id, data.customerId, now, now);
    }

    if (data.stakeholders && data.stakeholders.length > 0) {
      for (const sh of data.stakeholders) {
        if (!sh.customerId || sh.customerId === data.customerId) continue;
        ensureCustomer(sqlite, sh.customerId);
        sqlite.prepare(`
          INSERT OR REPLACE INTO project_customers (
            id, project_id, customer_id, role, billing_percentage, is_primary, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
        `).run(
          randomUUID(),
          id,
          sh.customerId,
          sh.role,
          sh.billingPercentage ? parseFloat(sh.billingPercentage) : null,
          sh.notes || null,
          now,
          now,
        );
      }
    }
  }).immediate();

  try {
    recordActivity(businessId, {
      userId,
      action: "created",
      entityType: "project",
      entityId: id,
      entityNumber: data.code || id,
      summary: `Created project "${data.name}" (${data.status})`,
      details: { name: data.name, code: data.code, status: data.status, customerId: data.customerId },
      sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] project create failed:", e);
  }

  return id;
}

export function updateProject(businessId: string, userId: string, projectId: string, input: ProjectInput) {
  const data = projectInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const current = sqlite.prepare("SELECT id, code, customer_id FROM projects WHERE id = ?").get(projectId) as { id: string; code: string; customer_id: string | null } | undefined;
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
      ) linked 
      WHERE customer_id <> ? 
        AND customer_id NOT IN (SELECT customer_id FROM project_customers WHERE project_id = ?)
      LIMIT 1
    `).get(projectId, projectId, projectId, projectId, data.customerId, projectId);
    if (mismatch) throw new Error("Selected project has documents belonging to an unassociated customer.");
  }

  const now = new Date().toISOString();
  sqlite.transaction(() => {
    sqlite.prepare(`
      UPDATE projects SET code = ?, name = ?, customer_id = ?, status = ?, description = ?,
        start_date = ?, target_end_date = ?, actual_end_date = ?, budget_revenue_minor = ?,
        budget_cost_minor = ?, manager_name = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(code, data.name, data.customerId || null, data.status, data.description || null,
      data.startDate || null, data.targetEndDate || null, data.actualEndDate || null,
      budgetValue(data.budgetRevenue), budgetValue(data.budgetCost), data.managerName || null,
      data.status === "cancelled" ? 0 : 1, now, projectId);

    if (data.customerId) {
      sqlite.prepare("UPDATE project_customers SET is_primary = 0 WHERE project_id = ?").run(projectId);
      sqlite.prepare(`
        INSERT INTO project_customers (
          id, project_id, customer_id, role, billing_percentage, is_primary, notes, created_at, updated_at
        ) VALUES (?, ?, ?, 'primary_client', NULL, 1, 'Primary Client', ?, ?)
        ON CONFLICT(project_id, customer_id) DO UPDATE SET is_primary = 1, role = 'primary_client', updated_at = ?
      `).run(randomUUID(), projectId, data.customerId, now, now, now);
    }
  }).immediate();

  try {
    recordActivity(businessId, {
      userId,
      action: "updated",
      entityType: "project",
      entityId: projectId,
      entityNumber: code,
      summary: `Updated project "${data.name}" (${data.status})`,
      details: { name: data.name, code, status: data.status, customerId: data.customerId },
      sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] project update failed:", e);
  }
}

export function addProjectCustomer(
  businessId: string,
  userId: string,
  projectId: string,
  input: ProjectCustomerInput,
) {
  const data = projectCustomerInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const project = sqlite.prepare("SELECT id, customer_id FROM projects WHERE id = ?").get(projectId) as { id: string; customer_id: string | null } | undefined;
  if (!project) throw new Error("Project not found.");
  ensureCustomer(sqlite, data.customerId);

  const now = new Date().toISOString();
  sqlite.transaction(() => {
    const isPrimary = Boolean(data.isPrimary || data.role === "primary_client");
    if (isPrimary) {
      sqlite.prepare("UPDATE project_customers SET is_primary = 0 WHERE project_id = ?").run(projectId);
      sqlite.prepare("UPDATE projects SET customer_id = ? WHERE id = ?").run(data.customerId, projectId);
    }

    sqlite.prepare(`
      INSERT INTO project_customers (
        id, project_id, customer_id, role, billing_percentage, is_primary, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, customer_id) DO UPDATE SET
        role = excluded.role,
        billing_percentage = excluded.billing_percentage,
        is_primary = excluded.is_primary,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).run(
      randomUUID(),
      projectId,
      data.customerId,
      data.role,
      data.billingPercentage ? parseFloat(data.billingPercentage) : null,
      isPrimary ? 1 : 0,
      data.notes || null,
      now,
      now,
    );
  }).immediate();
}

export function removeProjectCustomer(businessId: string, userId: string, projectId: string, customerId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const project = sqlite.prepare("SELECT id, customer_id FROM projects WHERE id = ?").get(projectId) as { id: string; customer_id: string | null } | undefined;
  if (!project) throw new Error("Project not found.");

  if (project.customer_id === customerId) {
    const otherCustomers = sqlite.prepare("SELECT customer_id FROM project_customers WHERE project_id = ? AND customer_id <> ?").all(projectId, customerId) as { customer_id: string }[];
    if (otherCustomers.length > 0) {
      throw new Error("Cannot remove the primary client while other stakeholders remain. Please reassign the primary client first.");
    }
  }

  const linked = sqlite.prepare(`
    SELECT 1 FROM (
      SELECT 1 FROM sales_invoices i WHERE i.customer_id = ? AND (i.project_id = ? OR EXISTS (SELECT 1 FROM sales_invoice_lines l WHERE l.invoice_id = i.id AND l.project_id = ?))
      UNION ALL
      SELECT 1 FROM sales_orders o WHERE o.customer_id = ? AND (o.project_id = ? OR EXISTS (SELECT 1 FROM sales_order_lines l WHERE l.order_id = o.id AND l.project_id = ?))
      UNION ALL
      SELECT 1 FROM sales_quotes q WHERE q.customer_id = ? AND (q.project_id = ? OR EXISTS (SELECT 1 FROM sales_quote_lines l WHERE l.quote_id = q.id AND l.project_id = ?))
      UNION ALL
      SELECT 1 FROM sales_credit_notes n WHERE n.customer_id = ? AND (n.project_id = ? OR EXISTS (SELECT 1 FROM sales_credit_note_lines l WHERE l.credit_note_id = n.id AND l.project_id = ?))
      UNION ALL
      SELECT 1 FROM delivery_notes d WHERE d.customer_id = ? AND (d.project_id = ? OR EXISTS (SELECT 1 FROM delivery_note_lines l WHERE l.delivery_note_id = d.id AND l.project_id = ?))
    ) LIMIT 1
  `).get(
    customerId, projectId, projectId,
    customerId, projectId, projectId,
    customerId, projectId, projectId,
    customerId, projectId, projectId,
    customerId, projectId, projectId,
  );

  if (linked) {
    throw new Error("Cannot remove customer because transactions have already been billed or quoted to them under this project.");
  }

  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM project_customers WHERE project_id = ? AND customer_id = ?").run(projectId, customerId);
    if (project.customer_id === customerId) {
      sqlite.prepare("UPDATE projects SET customer_id = NULL WHERE id = ?").run(projectId);
    }
  }).immediate();
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
    stakeholders: (project.customers || []).map((c) => ({
      customerId: c.customerId,
      role: c.role,
      billingPercentage: c.billingPercentage !== null ? String(c.billingPercentage) : "",
      isPrimary: c.isPrimary,
      notes: c.notes ?? "",
    })),
  };
}

export function deleteProject(businessId: string, userId: string, projectId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const existing = sqlite.prepare("SELECT code, name FROM projects WHERE id = ?").get(projectId) as { code: string; name: string } | undefined;
  if (!existing) throw new Error("Project not found.");
  const linked = sqlite.prepare(`
    SELECT 1 FROM (
      SELECT project_id FROM sales_invoices WHERE project_id = ?
      UNION ALL SELECT project_id FROM sales_invoice_lines WHERE project_id = ?
      UNION ALL SELECT project_id FROM sales_credit_notes WHERE project_id = ?
      UNION ALL SELECT project_id FROM sales_credit_note_lines WHERE project_id = ?
      UNION ALL SELECT project_id FROM purchase_orders WHERE project_id = ?
      UNION ALL SELECT project_id FROM purchase_order_lines WHERE project_id = ?
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

  try {
    recordActivity(businessId, {
      userId,
      action: "deleted",
      entityType: "project",
      entityId: projectId,
      entityNumber: existing.code,
      summary: `Deleted project "${existing.name}" (${existing.code})`,
      sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] project delete failed:", e);
  }
}
