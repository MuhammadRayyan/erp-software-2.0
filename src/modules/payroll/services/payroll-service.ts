import { assertSavePermission, assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { postTransaction, reverseTransaction } from "@/modules/accounting/services/posting-service";
import { assertDateNotLocked } from "@/modules/accounting/services/financial-lock-service";
import { addMinor } from "@/modules/accounting/calculations/money";

export interface EmployeeInput {
  id?: string;
  name: string;
  code?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  designation?: string | null;
  department?: string | null;
  joiningDate?: string | null;
  basicSalaryMinor?: number | null;
  housingAllowanceMinor?: number | null;
  transportAllowanceMinor?: number | null;
  otherAllowancesMinor?: number | null;
  isActive?: boolean;
}

export interface EmployeeRecord {
  id: string;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  designation: string | null;
  department: string | null;
  joiningDate: string | null;
  basicSalaryMinor: number | null;
  housingAllowanceMinor: number | null;
  transportAllowanceMinor: number | null;
  otherAllowancesMinor: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PayslipItemInput {
  id?: string;
  name: string;
  type: "earnings" | "deduction";
  accountId: string;
  description?: string | null;
  isActive?: boolean;
  position?: number;
}

export interface PayslipItemRecord {
  id: string;
  name: string;
  type: "earnings" | "deduction";
  accountId: string;
  accountName?: string;
  description: string | null;
  isActive: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface PayslipLineInput {
  id?: string;
  itemId?: string | null;
  type: "earnings" | "deduction";
  description: string;
  accountId: string;
  amountMinor: number;
  position?: number;
}

export interface PayslipLineRecord {
  id: string;
  payslipId: string;
  itemId: string | null;
  itemName?: string;
  type: "earnings" | "deduction";
  description: string;
  accountId: string;
  accountName?: string;
  amountMinor: number;
  position: number;
}

export interface PayslipInput {
  id?: string;
  payslipNumber?: string;
  employeeId: string;
  date: string;
  periodDescription?: string | null;
  documentStatus?: "draft" | "posted" | "void";
  notes?: string | null;
  lines: PayslipLineInput[];
  autoPost?: boolean;
}

export interface PayslipRecord {
  id: string;
  payslipNumber: string;
  employeeId: string;
  employeeName?: string;
  employeeDesignation?: string;
  employeeDepartment?: string;
  date: string;
  periodDescription: string | null;
  grossAmountMinor: number;
  deductionsMinor: number;
  netAmountMinor: number;
  documentStatus: "draft" | "posted" | "void";
  notes: string | null;
  journalEntryId: string | null;
  createdBy: string;
  createdAt: string;
  postedAt: string | null;
  updatedAt: string;
}

// -------------------------------------------------------------
// EMPLOYEE OPERATIONS
// -------------------------------------------------------------

export function listEmployees(
  businessId: string,
  userId: string,
  options?: { search?: string; isActive?: boolean }
): EmployeeRecord[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  let query = `
    SELECT
      id, code, name, email, phone, address, designation, department,
      joining_date AS joiningDate,
      basic_salary_minor AS basicSalaryMinor,
      housing_allowance_minor AS housingAllowanceMinor,
      transport_allowance_minor AS transportAllowanceMinor,
      other_allowances_minor AS otherAllowancesMinor,
      is_active AS isActive,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM employees
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (options?.isActive !== undefined) {
    query += ` AND is_active = ?`;
    params.push(options.isActive ? 1 : 0);
  }

  if (options?.search) {
    query += ` AND (name LIKE ? OR code LIKE ? OR designation LIKE ? OR department LIKE ?)`;
    const term = `%${options.search}%`;
    params.push(term, term, term, term);
  }

  query += ` ORDER BY name ASC`;

  const rows = sqlite.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    code: r.code ? String(r.code) : null,
    email: r.email ? String(r.email) : null,
    phone: r.phone ? String(r.phone) : null,
    address: r.address ? String(r.address) : null,
    designation: r.designation ? String(r.designation) : null,
    department: r.department ? String(r.department) : null,
    joiningDate: r.joiningDate ? String(r.joiningDate) : null,
    basicSalaryMinor: r.basicSalaryMinor !== null ? Number(r.basicSalaryMinor) : null,
    housingAllowanceMinor: r.housingAllowanceMinor !== null ? Number(r.housingAllowanceMinor) : null,
    transportAllowanceMinor: r.transportAllowanceMinor !== null ? Number(r.transportAllowanceMinor) : null,
    otherAllowancesMinor: r.otherAllowancesMinor !== null ? Number(r.otherAllowancesMinor) : null,
    isActive: Boolean(r.isActive),
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
  }));
}

export function getEmployee(
  businessId: string,
  userId: string,
  employeeId: string
): EmployeeRecord | null {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare(`
      SELECT
        id, code, name, email, phone, address, designation, department,
        joining_date AS joiningDate,
        basic_salary_minor AS basicSalaryMinor,
        housing_allowance_minor AS housingAllowanceMinor,
        transport_allowance_minor AS transportAllowanceMinor,
        other_allowances_minor AS otherAllowancesMinor,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM employees
      WHERE id = ?
    `)
    .get(employeeId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: String(row.id),
    name: String(row.name),
    code: row.code ? String(row.code) : null,
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    address: row.address ? String(row.address) : null,
    designation: row.designation ? String(row.designation) : null,
    department: row.department ? String(row.department) : null,
    joiningDate: row.joiningDate ? String(row.joiningDate) : null,
    basicSalaryMinor: row.basicSalaryMinor !== null ? Number(row.basicSalaryMinor) : null,
    housingAllowanceMinor: row.housingAllowanceMinor !== null ? Number(row.housingAllowanceMinor) : null,
    transportAllowanceMinor: row.transportAllowanceMinor !== null ? Number(row.transportAllowanceMinor) : null,
    otherAllowancesMinor: row.otherAllowancesMinor !== null ? Number(row.otherAllowancesMinor) : null,
    isActive: Boolean(row.isActive),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export function saveEmployee(
  businessId: string,
  userId: string,
  input: EmployeeInput
): string {
  assertSavePermission(businessId, userId, "payroll", input.id, "draft");
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  const id = input.id || randomUUID();

  const existing = sqlite.prepare(`SELECT id FROM employees WHERE id = ?`).get(id);
  if (input.id && !existing) throw new Error("Employee not found.");

  if (existing) {
    sqlite
      .prepare(`
        UPDATE employees
        SET
          name = ?, code = ?, email = ?, phone = ?, address = ?,
          designation = ?, department = ?, joining_date = ?,
          basic_salary_minor = ?, housing_allowance_minor = ?,
          transport_allowance_minor = ?, other_allowances_minor = ?,
          is_active = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        input.name,
        input.code || null,
        input.email || null,
        input.phone || null,
        input.address || null,
        input.designation || null,
        input.department || null,
        input.joiningDate || null,
        input.basicSalaryMinor !== undefined ? input.basicSalaryMinor : null,
        input.housingAllowanceMinor !== undefined ? input.housingAllowanceMinor : null,
        input.transportAllowanceMinor !== undefined ? input.transportAllowanceMinor : null,
        input.otherAllowancesMinor !== undefined ? input.otherAllowancesMinor : null,
        input.isActive !== undefined ? (input.isActive ? 1 : 0) : 1,
        now,
        id
      );
  } else {
    sqlite
      .prepare(`
        INSERT INTO employees (
          id, name, code, email, phone, address, designation, department,
          joining_date, basic_salary_minor, housing_allowance_minor,
          transport_allowance_minor, other_allowances_minor, is_active,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.name,
        input.code || null,
        input.email || null,
        input.phone || null,
        input.address || null,
        input.designation || null,
        input.department || null,
        input.joiningDate || null,
        input.basicSalaryMinor !== undefined ? input.basicSalaryMinor : null,
        input.housingAllowanceMinor !== undefined ? input.housingAllowanceMinor : null,
        input.transportAllowanceMinor !== undefined ? input.transportAllowanceMinor : null,
        input.otherAllowancesMinor !== undefined ? input.otherAllowancesMinor : null,
        input.isActive !== undefined ? (input.isActive ? 1 : 0) : 1,
        now,
        now
      );
  }

  return id;
}

export function toggleEmployeeActive(
  businessId: string,
  userId: string,
  employeeId: string,
  isActive: boolean
): void {
  assertMutationPermission(businessId, userId, "payroll", "edit");
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  sqlite
    .prepare(`UPDATE employees SET is_active = ?, updated_at = ? WHERE id = ?`)
    .run(isActive ? 1 : 0, now, employeeId);
}

// -------------------------------------------------------------
// PAYSLIP ITEM OPERATIONS
// -------------------------------------------------------------

export function listPayslipItems(
  businessId: string,
  userId: string,
  options?: { type?: "earnings" | "deduction"; isActive?: boolean }
): PayslipItemRecord[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  let query = `
    SELECT
      pi.id, pi.name, pi.type, pi.account_id AS accountId,
      a.name AS accountName, pi.description, pi.is_active AS isActive,
      pi.position, pi.created_at AS createdAt, pi.updated_at AS updatedAt
    FROM payslip_items pi
    LEFT JOIN accounts a ON a.id = pi.account_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (options?.type) {
    query += ` AND pi.type = ?`;
    params.push(options.type);
  }

  if (options?.isActive !== undefined) {
    query += ` AND pi.is_active = ?`;
    params.push(options.isActive ? 1 : 0);
  }

  query += ` ORDER BY pi.type ASC, pi.position ASC, pi.name ASC`;

  const rows = sqlite.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    type: r.type as "earnings" | "deduction",
    accountId: String(r.accountId),
    accountName: r.accountName ? String(r.accountName) : undefined,
    description: r.description ? String(r.description) : null,
    isActive: Boolean(r.isActive),
    position: Number(r.position),
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
  }));
}

export function getPayslipItem(
  businessId: string,
  userId: string,
  itemId: string
): PayslipItemRecord | null {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare(`
      SELECT
        pi.id, pi.name, pi.type, pi.account_id AS accountId,
        a.name AS accountName, pi.description, pi.is_active AS isActive,
        pi.position, pi.created_at AS createdAt, pi.updated_at AS updatedAt
      FROM payslip_items pi
      LEFT JOIN accounts a ON a.id = pi.account_id
      WHERE pi.id = ?
    `)
    .get(itemId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as "earnings" | "deduction",
    accountId: String(row.accountId),
    accountName: row.accountName ? String(row.accountName) : undefined,
    description: row.description ? String(row.description) : null,
    isActive: Boolean(row.isActive),
    position: Number(row.position),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export function savePayslipItem(
  businessId: string,
  userId: string,
  input: PayslipItemInput
): string {
  assertSavePermission(businessId, userId, "payroll", input.id, "draft");
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  const id = input.id || `item-${randomUUID().slice(0, 8)}`;

  const existing = sqlite.prepare(`SELECT id FROM payslip_items WHERE id = ?`).get(id);
  if (input.id && !existing) throw new Error("Payslip item not found.");

  if (existing) {
    sqlite
      .prepare(`
        UPDATE payslip_items
        SET
          name = ?, type = ?, account_id = ?, description = ?,
          is_active = ?, position = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        input.name,
        input.type,
        input.accountId,
        input.description || null,
        input.isActive !== undefined ? (input.isActive ? 1 : 0) : 1,
        input.position !== undefined ? input.position : 0,
        now,
        id
      );
  } else {
    sqlite
      .prepare(`
        INSERT INTO payslip_items (
          id, name, type, account_id, description, is_active, position,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.name,
        input.type,
        input.accountId,
        input.description || null,
        input.isActive !== undefined ? (input.isActive ? 1 : 0) : 1,
        input.position !== undefined ? input.position : 0,
        now,
        now
      );
  }

  return id;
}

// -------------------------------------------------------------
// PAYSLIP OPERATIONS
// -------------------------------------------------------------

export function listPayslips(
  businessId: string,
  userId: string,
  options?: {
    employeeId?: string;
    status?: "draft" | "posted" | "void";
    dateFrom?: string;
    dateTo?: string;
  }
): PayslipRecord[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  let query = `
    SELECT
      p.id, p.payslip_number AS payslipNumber, p.employee_id AS employeeId,
      e.name AS employeeName, e.designation AS employeeDesignation, e.department AS employeeDepartment,
      p.date, p.period_description AS periodDescription,
      p.gross_amount_minor AS grossAmountMinor,
      p.deductions_minor AS deductionsMinor,
      p.net_amount_minor AS netAmountMinor,
      p.document_status AS documentStatus,
      p.notes, p.journal_entry_id AS journalEntryId,
      p.created_by AS createdBy, p.created_at AS createdAt,
      p.posted_at AS postedAt, p.updated_at AS updatedAt
    FROM payslips p
    LEFT JOIN employees e ON e.id = p.employee_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (options?.employeeId) {
    query += ` AND p.employee_id = ?`;
    params.push(options.employeeId);
  }

  if (options?.status) {
    query += ` AND p.document_status = ?`;
    params.push(options.status);
  }

  if (options?.dateFrom) {
    query += ` AND p.date >= ?`;
    params.push(options.dateFrom);
  }

  if (options?.dateTo) {
    query += ` AND p.date <= ?`;
    params.push(options.dateTo);
  }

  query += ` ORDER BY p.date DESC, p.payslip_number DESC`;

  const rows = sqlite.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    payslipNumber: String(r.payslipNumber),
    employeeId: String(r.employeeId),
    employeeName: r.employeeName ? String(r.employeeName) : undefined,
    employeeDesignation: r.employeeDesignation ? String(r.employeeDesignation) : undefined,
    employeeDepartment: r.employeeDepartment ? String(r.employeeDepartment) : undefined,
    date: String(r.date),
    periodDescription: r.periodDescription ? String(r.periodDescription) : null,
    grossAmountMinor: Number(r.grossAmountMinor),
    deductionsMinor: Number(r.deductionsMinor),
    netAmountMinor: Number(r.netAmountMinor),
    documentStatus: r.documentStatus as "draft" | "posted" | "void",
    notes: r.notes ? String(r.notes) : null,
    journalEntryId: r.journalEntryId ? String(r.journalEntryId) : null,
    createdBy: String(r.createdBy),
    createdAt: String(r.createdAt),
    postedAt: r.postedAt ? String(r.postedAt) : null,
    updatedAt: String(r.updatedAt),
  }));
}

export function getPayslipWithLines(
  businessId: string,
  userId: string,
  payslipId: string
): {
  payslip: PayslipRecord;
  employee: EmployeeRecord;
  lines: PayslipLineRecord[];
  journal?: { id: string; entryNumber: string } | null;
} | null {
  const { sqlite } = getBusinessDb(businessId, userId);
  const pRow = sqlite
    .prepare(`
      SELECT
        p.id, p.payslip_number AS payslipNumber, p.employee_id AS employeeId,
        e.name AS employeeName, e.designation AS employeeDesignation, e.department AS employeeDepartment,
        p.date, p.period_description AS periodDescription,
        p.gross_amount_minor AS grossAmountMinor,
        p.deductions_minor AS deductionsMinor,
        p.net_amount_minor AS netAmountMinor,
        p.document_status AS documentStatus,
        p.notes, p.journal_entry_id AS journalEntryId,
        p.created_by AS createdBy, p.created_at AS createdAt,
        p.posted_at AS postedAt, p.updated_at AS updatedAt
      FROM payslips p
      LEFT JOIN employees e ON e.id = p.employee_id
      WHERE p.id = ?
    `)
    .get(payslipId) as Record<string, unknown> | undefined;

  if (!pRow) return null;

  const empRecord = getEmployee(businessId, userId, String(pRow.employeeId));
  const employee: EmployeeRecord = empRecord || {
    id: String(pRow.employeeId || "unknown"),
    name: pRow.employeeName ? String(pRow.employeeName) : "Unknown Employee",
    code: null,
    email: null,
    phone: null,
    address: null,
    designation: pRow.employeeDesignation ? String(pRow.employeeDesignation) : null,
    department: pRow.employeeDepartment ? String(pRow.employeeDepartment) : null,
    joiningDate: null,
    basicSalaryMinor: null,
    housingAllowanceMinor: null,
    transportAllowanceMinor: null,
    otherAllowancesMinor: null,
    isActive: true,
    createdAt: String(pRow.createdAt),
    updatedAt: String(pRow.updatedAt),
  };

  const payslip: PayslipRecord = {
    id: String(pRow.id),
    payslipNumber: String(pRow.payslipNumber),
    employeeId: String(pRow.employeeId),
    employeeName: pRow.employeeName ? String(pRow.employeeName) : undefined,
    employeeDesignation: pRow.employeeDesignation ? String(pRow.employeeDesignation) : undefined,
    employeeDepartment: pRow.employeeDepartment ? String(pRow.employeeDepartment) : undefined,
    date: String(pRow.date),
    periodDescription: pRow.periodDescription ? String(pRow.periodDescription) : null,
    grossAmountMinor: Number(pRow.grossAmountMinor),
    deductionsMinor: Number(pRow.deductionsMinor),
    netAmountMinor: Number(pRow.netAmountMinor),
    documentStatus: pRow.documentStatus as "draft" | "posted" | "void",
    notes: pRow.notes ? String(pRow.notes) : null,
    journalEntryId: pRow.journalEntryId ? String(pRow.journalEntryId) : null,
    createdBy: String(pRow.createdBy),
    createdAt: String(pRow.createdAt),
    postedAt: pRow.postedAt ? String(pRow.postedAt) : null,
    updatedAt: String(pRow.updatedAt),
  };

  const lineRows = sqlite
    .prepare(`
      SELECT
        pl.id, pl.payslip_id AS payslipId, pl.item_id AS itemId,
        pi.name AS itemName, pl.type, pl.description, pl.account_id AS accountId,
        a.name AS accountName, pl.amount_minor AS amountMinor, pl.position
      FROM payslip_lines pl
      LEFT JOIN payslip_items pi ON pi.id = pl.item_id
      LEFT JOIN accounts a ON a.id = pl.account_id
      WHERE pl.payslip_id = ?
      ORDER BY pl.position ASC
    `)
    .all(payslipId) as Record<string, unknown>[];

  const lines: PayslipLineRecord[] = lineRows.map((l) => ({
    id: String(l.id),
    payslipId: String(l.payslipId),
    itemId: l.itemId ? String(l.itemId) : null,
    itemName: l.itemName ? String(l.itemName) : undefined,
    type: l.type as "earnings" | "deduction",
    description: String(l.description),
    accountId: String(l.accountId),
    accountName: l.accountName ? String(l.accountName) : undefined,
    amountMinor: Number(l.amountMinor),
    position: Number(l.position),
  }));

  let journal: { id: string; entryNumber: string } | null = null;
  if (payslip.journalEntryId) {
    const jRow = sqlite
      .prepare(`SELECT id, entry_number AS entryNumber FROM journal_entries WHERE id = ?`)
      .get(payslip.journalEntryId) as { id: string; entryNumber: string } | undefined;
    if (jRow) journal = jRow;
  }

  return { payslip, employee, lines, journal };
}

export function savePayslip(
  businessId: string,
  userId: string,
  input: PayslipInput
): string {
  assertSavePermission(businessId, userId, "payroll", input.id, input.autoPost ? "post" : "draft");
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  const id = input.id || randomUUID();

  // Validate line items
  if (!input.lines || input.lines.length === 0) {
    throw new Error("Payslip must contain at least one earnings line.");
  }

  let grossAmountMinor = 0;
  let deductionsMinor = 0;

  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor < 0) {
      throw new Error("Line amounts must be non-negative.");
    }
    if (line.type === "earnings") {
      grossAmountMinor = addMinor([grossAmountMinor, line.amountMinor]);
    } else if (line.type === "deduction") {
      deductionsMinor = addMinor([deductionsMinor, line.amountMinor]);
    } else {
      throw new Error(`Invalid line type: ${line.type}`);
    }
  }

  const netAmountMinor = addMinor([grossAmountMinor, -deductionsMinor]);
  if (netAmountMinor < 0) {
    throw new Error("Total deductions cannot exceed gross earnings.");
  }

  context.sqlite.transaction(() => {
    assertDateNotLocked(context.sqlite, input.date, "Payslip");

    const existing = context.sqlite
      .prepare(`SELECT id, payslip_number, document_status FROM payslips WHERE id = ?`)
      .get(id) as { id: string; payslip_number: string; document_status: string } | undefined;

    if (existing && existing.document_status === "void") {
      throw new Error("Cannot modify a voided payslip.");
    }

    if (input.id && !existing) throw new Error("Payslip not found.");
    if (existing?.document_status === "posted") {
      throw new Error("Posted payslips cannot be edited. Void the payslip and create a corrected draft.");
    }
    if (input.documentStatus && input.documentStatus !== "draft") {
      throw new Error("Payslip status is controlled by posting and void actions.");
    }

    const payslipNumber = existing
      ? existing.payslip_number
      : (input.payslipNumber?.trim() || allocateNumber(context.sqlite, "payslip"));

    const documentStatus = "draft";

    if (existing) {
      context.sqlite
        .prepare(`
          UPDATE payslips
          SET
            employee_id = ?, date = ?, period_description = ?,
            gross_amount_minor = ?, deductions_minor = ?, net_amount_minor = ?,
            document_status = ?, notes = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(
          input.employeeId,
          input.date,
          input.periodDescription || null,
          grossAmountMinor,
          deductionsMinor,
          netAmountMinor,
          documentStatus,
          input.notes || null,
          now,
          id
        );

      context.sqlite.prepare(`DELETE FROM payslip_lines WHERE payslip_id = ?`).run(id);
    } else {
      context.sqlite
        .prepare(`
          INSERT INTO payslips (
            id, payslip_number, employee_id, date, period_description,
            gross_amount_minor, deductions_minor, net_amount_minor,
            document_status, notes, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          payslipNumber,
          input.employeeId,
          input.date,
          input.periodDescription || null,
          grossAmountMinor,
          deductionsMinor,
          netAmountMinor,
          documentStatus,
          input.notes || null,
          userId,
          now,
          now
        );
    }

    const insertLine = context.sqlite.prepare(`
      INSERT INTO payslip_lines (
        id, payslip_id, item_id, type, description, account_id, amount_minor, position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    input.lines.forEach((line, idx) => {
      insertLine.run(
        line.id || randomUUID(),
        id,
        line.itemId || null,
        line.type,
        line.description,
        line.accountId,
        line.amountMinor,
        line.position !== undefined ? line.position : idx + 1
      );
    });

    if (input.autoPost) {
      postInternalPayslip(context.sqlite, id, userId, payslipNumber, input.employeeId, input.date, input.lines, netAmountMinor);
    }
  }).immediate();

  return id;
}

function resolvePayrollPayableAccountId(sqlite: any): string {
  const direct = sqlite.prepare(`SELECT id FROM accounts WHERE id = 'acct-payroll-payable-2200'`).get() as { id: string } | undefined;
  if (direct) return direct.id;

  const byName = sqlite.prepare(`
    SELECT id FROM accounts
    WHERE type = 'liability' AND (name LIKE '%Payroll Payable%' OR name LIKE '%Salaries Payable%')
    ORDER BY is_system DESC, created_at ASC
    LIMIT 1
  `).get() as { id: string } | undefined;
  if (byName) return byName.id;

  const anyLiability = sqlite.prepare(`
    SELECT id FROM accounts WHERE type = 'liability' ORDER BY is_system DESC, created_at ASC LIMIT 1
  `).get() as { id: string } | undefined;
  if (anyLiability) return anyLiability.id;

  throw new Error("No liability account found for Payroll Payable in Chart of Accounts.");
}

function postInternalPayslip(
  sqlite: any,
  payslipId: string,
  _userId: string,
  payslipNumber: string,
  employeeId: string,
  date: string,
  lines: PayslipLineInput[],
  netAmountMinor: number
): void {
  const emp = sqlite.prepare(`SELECT name FROM employees WHERE id = ?`).get(employeeId) as { name: string } | undefined;
  const employeeName = emp?.name || "Employee";

  // Build journal lines:
  // 1. Debit earnings lines
  // 2. Credit deduction lines
  // 3. Credit Payroll Payable for net pay
  const journalLines: Array<{
    accountId: string;
    description: string;
    debitMinor?: number;
    creditMinor?: number;
  }> = [];

  for (const line of lines) {
    if (line.amountMinor <= 0) continue;
    if (line.type === "earnings") {
      journalLines.push({
        accountId: line.accountId,
        description: `[Earnings] ${line.description} (${employeeName})`,
        debitMinor: line.amountMinor,
      });
    } else if (line.type === "deduction") {
      journalLines.push({
        accountId: line.accountId,
        description: `[Deduction] ${line.description} (${employeeName})`,
        creditMinor: line.amountMinor,
      });
    }
  }

  if (netAmountMinor > 0) {
    const payableAccountId = resolvePayrollPayableAccountId(sqlite);
    journalLines.push({
      accountId: payableAccountId,
      description: `Net Salary Payable (${employeeName})`,
      creditMinor: netAmountMinor,
    });
  }

  const result = postTransaction(sqlite, {
    sourceType: "payslip",
    sourceId: payslipId,
    date,
    description: `Payroll: ${payslipNumber} - ${employeeName}`,
    lines: journalLines,
    replace: true,
  });

  const now = new Date().toISOString();
  sqlite
    .prepare(`
      UPDATE payslips
      SET document_status = 'posted', posted_at = ?, journal_entry_id = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(now, result.id, now, payslipId);
}

export function postPayslipToLedger(
  businessId: string,
  userId: string,
  payslipId: string
): void {
  assertMutationPermission(businessId, userId, "payroll", "post");
  const context = getBusinessDb(businessId, userId);
  context.sqlite.transaction(() => {
    const record = getPayslipWithLines(businessId, userId, payslipId);
    if (!record) throw new Error("Payslip not found.");
    if (record.payslip.documentStatus === "void") {
      throw new Error("Cannot post a voided payslip.");
    }
    if (record.payslip.documentStatus === "posted") {
      if (!record.payslip.journalEntryId) throw new Error("Posted payslip is missing its journal. Reconciliation is required.");
      return;
    }
    assertDateNotLocked(context.sqlite, record.payslip.date, "Payslip");

    postInternalPayslip(
      context.sqlite,
      payslipId,
      userId,
      record.payslip.payslipNumber,
      record.payslip.employeeId,
      record.payslip.date,
      record.lines,
      record.payslip.netAmountMinor
    );
  }).immediate();
}

export function voidPayslip(
  businessId: string,
  userId: string,
  payslipId: string
): void {
  assertMutationPermission(businessId, userId, "payroll", "delete");
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  context.sqlite.transaction(() => {
    const record = getPayslipWithLines(businessId, userId, payslipId);
    if (!record) throw new Error("Payslip not found.");
    if (record.payslip.documentStatus === "void") {
      throw new Error("Payslip is already void.");
    }

    assertDateNotLocked(context.sqlite, record.payslip.date, "Payslip");
    assertDateNotLocked(context.sqlite, now.slice(0, 10), "Payslip void");

    if (record.payslip.documentStatus === "posted") {
      reverseTransaction(context.sqlite, {
        originalSourceType: "payslip",
        originalSourceId: payslipId,
        reversalSourceType: "payslip_void",
        reversalSourceId: payslipId,
        date: now.slice(0, 10),
        description: `Reverse Payslip ${record.payslip.payslipNumber} (${record.employee.name})`,
      });
    }

    context.sqlite
      .prepare(`UPDATE payslips SET document_status = 'void', updated_at = ? WHERE id = ?`)
      .run(now, payslipId);
  }).immediate();
}

// -------------------------------------------------------------
// BATCH PAY RUN GENERATION
// -------------------------------------------------------------

export function generateBatchPayslips(
  businessId: string,
  userId: string,
  options: {
    periodDate: string;
    periodDescription: string;
    employeeIds?: string[];
    autoPost?: boolean;
  }
): {
  createdCount: number;
  payslipIds: string[];
} {
  assertMutationPermission(businessId, userId, "payroll", "create");
  if (options.autoPost) assertMutationPermission(businessId, userId, "payroll", "post");
  const context = getBusinessDb(businessId, userId);
  const allEmployees = listEmployees(businessId, userId, { isActive: true });
  const selectedEmployees = options.employeeIds && options.employeeIds.length > 0
    ? allEmployees.filter((e) => options.employeeIds!.includes(e.id))
    : allEmployees;

  // Filter employees with active salary settings
  const eligibleEmployees = selectedEmployees.filter((e) =>
    (e.basicSalaryMinor ?? 0) > 0 ||
    (e.housingAllowanceMinor ?? 0) > 0 ||
    (e.transportAllowanceMinor ?? 0) > 0 ||
    (e.otherAllowancesMinor ?? 0) > 0
  );

  if (eligibleEmployees.length === 0) {
    throw new Error("No active employees with configured salary structures found.");
  }

  // Load active payslip items to map custom accounts dynamically
  const activeItems = listPayslipItems(businessId, userId, { isActive: true });
  const basicItem = activeItems.find((i) => i.id === "item-basic-salary" || i.name.toLowerCase().includes("basic"));
  const housingItem = activeItems.find((i) => i.id === "item-housing-allowance" || i.name.toLowerCase().includes("housing"));
  const transportItem = activeItems.find((i) => i.id === "item-transport-allowance" || i.name.toLowerCase().includes("transport"));
  const otherItem = activeItems.find((i) => i.id === "item-bonus-commission" || i.name.toLowerCase().includes("other") || i.name.toLowerCase().includes("bonus"));

  const defaultExpenseAccountId =
    basicItem?.accountId ||
    (context.sqlite.prepare(`SELECT id FROM accounts WHERE id = 'acct-salaries-expense-6100' OR type = 'expense' LIMIT 1`).get() as any)?.id ||
    "acct-salaries-expense-6100";

  const createdPayslipIds: string[] = [];

  context.sqlite.transaction(() => {
    assertDateNotLocked(context.sqlite, options.periodDate, "Pay run");

    for (const emp of eligibleEmployees) {
      const lines: PayslipLineInput[] = [];
      let pos = 1;

      if ((emp.basicSalaryMinor ?? 0) > 0) {
        lines.push({
          itemId: basicItem?.id || "item-basic-salary",
          type: "earnings",
          description: basicItem?.name || "Basic Salary",
          accountId: basicItem?.accountId || defaultExpenseAccountId,
          amountMinor: emp.basicSalaryMinor!,
          position: pos++,
        });
      }

      if ((emp.housingAllowanceMinor ?? 0) > 0) {
        lines.push({
          itemId: housingItem?.id || "item-housing-allowance",
          type: "earnings",
          description: housingItem?.name || "Housing Allowance",
          accountId: housingItem?.accountId || defaultExpenseAccountId,
          amountMinor: emp.housingAllowanceMinor!,
          position: pos++,
        });
      }

      if ((emp.transportAllowanceMinor ?? 0) > 0) {
        lines.push({
          itemId: transportItem?.id || "item-transport-allowance",
          type: "earnings",
          description: transportItem?.name || "Transport Allowance",
          accountId: transportItem?.accountId || defaultExpenseAccountId,
          amountMinor: emp.transportAllowanceMinor!,
          position: pos++,
        });
      }

      if ((emp.otherAllowancesMinor ?? 0) > 0) {
        lines.push({
          itemId: otherItem?.id || "item-bonus-commission",
          type: "earnings",
          description: otherItem?.name || "Other Allowance",
          accountId: otherItem?.accountId || defaultExpenseAccountId,
          amountMinor: emp.otherAllowancesMinor!,
          position: pos++,
        });
      }

      if (lines.length > 0) {
        const payslipId = savePayslip(businessId, userId, {
          employeeId: emp.id,
          date: options.periodDate,
          periodDescription: options.periodDescription,
          notes: `Monthly pay run - ${options.periodDescription}`,
          lines,
          autoPost: options.autoPost ?? false,
        });
        createdPayslipIds.push(payslipId);
      }
    }
  }).immediate();

  return {
    createdCount: createdPayslipIds.length,
    payslipIds: createdPayslipIds,
  };
}
