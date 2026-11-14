import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { getBusinessDb } from "@/core/db/business";
import { getBusinessProfile } from "@/modules/business-profile/business-profile-service";

export interface WpsExportOptions {
  /** YYYY-MM e.g. "2026-11" */
  salaryMonth?: string;
  /** Optional explicit pay period description match */
  periodDescription?: string;
  /** Optional explicit payslip IDs */
  payslipIds?: string[];
  /** Optional payment reference on SCR line */
  employerReference?: string;
}

export interface WpsValidationIssue {
  scope: "employer" | "employee" | "payslips";
  employeeId?: string;
  employeeName?: string;
  payslipNumber?: string;
  message: string;
}

export interface WpsEdrPreviewRow {
  payslipId: string;
  payslipNumber: string;
  employeeId: string;
  employeeName: string;
  molPersonId: string;
  bankRoutingCode: string;
  iban: string;
  payStartDate: string;
  payEndDate: string;
  daysInPeriod: number;
  fixedMinor: number;
  variableMinor: number;
  netMinor: number;
}

export interface WpsSifResult {
  valid: boolean;
  errors: WpsValidationIssue[];
  warnings: WpsValidationIssue[];
  filename: string;
  sifContent: string;
  summary: {
    employerMolId: string;
    employerRoutingCode: string;
    salaryMonthMmyyyy: string;
    edrCount: number;
    totalFixedMinor: number;
    totalVariableMinor: number;
    totalSalaryMinor: number;
    currency: string;
  };
  rows: WpsEdrPreviewRow[];
}

function daysInclusive(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 30;
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(1, Math.min(31, diff));
}

function monthBounds(ym: string): { start: string; end: string; mmyyyy: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    return monthBounds(`${y}-${m}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    mmyyyy: `${String(month).padStart(2, "0")}${year}`,
  };
}

function formatMinor2dp(minor: number): string {
  return (minor / 100).toFixed(2);
}

function padNumericDigits(raw: string | null | undefined, length: number): string {
  const clean = (raw ?? "").replace(/\D+/g, "");
  if (!clean) return "";
  return clean.length >= length ? clean.slice(0, length) : clean.padStart(length, "0");
}

export function generateWpsSifFile(
  businessId: string,
  userId: string,
  options: WpsExportOptions = {},
): WpsSifResult {
  assertMutationPermission(businessId, userId, "payroll", "export");
  const { sqlite } = getBusinessDb(businessId, userId);
  const profile = getBusinessProfile(businessId, userId);

  const errors: WpsValidationIssue[] = [];
  const warnings: WpsValidationIssue[] = [];

  const rawEmployerMol = (profile.molEstablishmentId || "").replace(/\D+/g, "");
  const rawEmployerRouting = (profile.wpsBankRoutingCode || "").replace(/\D+/g, "");

  if (!rawEmployerMol) {
    errors.push({
      scope: "employer",
      message: "Company MOL / MOHRE Establishment ID (13 digits) is missing in Settings -> Business Profile.",
    });
  } else if (!/^\d{1,13}$/.test(rawEmployerMol)) {
    errors.push({
      scope: "employer",
      message: "Company MOL Establishment ID must be numeric (up to 13 digits).",
    });
  }

  if (!rawEmployerRouting) {
    errors.push({
      scope: "employer",
      message: "Company WPS Bank Routing Code (9 digits) is missing in Settings -> Business Profile.",
    });
  } else if (!/^\d{9}$/.test(rawEmployerRouting)) {
    errors.push({
      scope: "employer",
      message: "Company WPS Bank Routing Code must be exactly 9 numeric digits.",
    });
  }

  const targetYm = options.salaryMonth || new Date().toISOString().slice(0, 7);
  const bounds = monthBounds(targetYm);

  // Load candidate posted payslips
  let sql = `
    SELECT
      p.id,
      p.payslip_number,
      p.employee_id,
      p.date,
      p.period_description,
      p.net_amount_minor,
      e.name AS employee_name,
      e.mol_person_id,
      e.bank_routing_code,
      e.iban,
      e.wps_enabled
    FROM payslips p
    INNER JOIN employees e ON e.id = p.employee_id
    WHERE p.document_status = 'posted'
      AND p.net_amount_minor > 0
  `;
  const params: unknown[] = [];

  if (options.payslipIds && options.payslipIds.length > 0) {
    const placeholders = options.payslipIds.map(() => "?").join(", ");
    sql += ` AND p.id IN (${placeholders})`;
    params.push(...options.payslipIds);
  } else if (options.periodDescription) {
    sql += ` AND p.period_description = ?`;
    params.push(options.periodDescription);
  } else if (options.salaryMonth) {
    sql += ` AND p.date BETWEEN ? AND ?`;
    params.push(bounds.start, bounds.end);
  }

  sql += ` ORDER BY e.name ASC, p.date ASC`;

  const payslipRows = sqlite.prepare(sql).all(...params) as {
    id: string;
    payslip_number: string;
    employee_id: string;
    date: string;
    period_description: string | null;
    net_amount_minor: number;
    employee_name: string;
    mol_person_id: string | null;
    bank_routing_code: string | null;
    iban: string | null;
    wps_enabled: number;
  }[];

  const includedRows = payslipRows.filter((row) => Boolean(row.wps_enabled));

  if (includedRows.length === 0) {
    errors.push({
      scope: "payslips",
      message:
        payslipRows.length > 0
          ? "No WPS-enabled posted payslips found for the selected filter."
          : "No posted payslips with positive net pay found for the selected period.",
    });
  }

  const lineStmt = sqlite.prepare(`
    SELECT type, description, amount_minor
    FROM payslip_lines
    WHERE payslip_id = ?
    ORDER BY position ASC
  `);

  const edrRows: WpsEdrPreviewRow[] = [];

  for (const row of includedRows) {
    const molDigits = (row.mol_person_id || "").replace(/\D+/g, "");
    const routingDigits = (row.bank_routing_code || "").replace(/\D+/g, "");
    const ibanClean = (row.iban || "").replace(/\s+/g, "").toUpperCase();

    if (!molDigits || molDigits.length > 14) {
      errors.push({
        scope: "employee",
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        payslipNumber: row.payslip_number,
        message: `${row.employee_name}: MOL Person ID (14 digits) is missing or invalid.`,
      });
    }
    if (!/^\d{9}$/.test(routingDigits)) {
      errors.push({
        scope: "employee",
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        payslipNumber: row.payslip_number,
        message: `${row.employee_name}: Employee Bank Routing Code must be 9 numeric digits.`,
      });
    }
    if (!ibanClean) {
      errors.push({
        scope: "employee",
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        payslipNumber: row.payslip_number,
        message: `${row.employee_name}: Employee IBAN is missing.`,
      });
    } else if (!/^AE\d{21}$/.test(ibanClean)) {
      warnings.push({
        scope: "employee",
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        payslipNumber: row.payslip_number,
        message: `${row.employee_name}: Account/IBAN "${ibanClean}" does not match standard 23-character UAE IBAN (AE + 21 digits).`,
      });
    }

    const lines = lineStmt.all(row.id) as {
      type: "earnings" | "deduction";
      description: string;
      amount_minor: number;
    }[];

    let variableMinor = 0;
    for (const line of lines) {
      if (
        line.type === "earnings" &&
        /overtime|commission|bonus|incentive|variable/i.test(line.description)
      ) {
        variableMinor += line.amount_minor;
      }
    }
    variableMinor = Math.min(variableMinor, row.net_amount_minor);
    const fixedMinor = row.net_amount_minor - variableMinor;

    const slipYm = row.date.slice(0, 7);
    const slipBounds = monthBounds(options.salaryMonth || slipYm);
    const days = daysInclusive(slipBounds.start, slipBounds.end);

    edrRows.push({
      payslipId: row.id,
      payslipNumber: row.payslip_number,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      molPersonId: padNumericDigits(molDigits, 14),
      bankRoutingCode: routingDigits,
      iban: ibanClean,
      payStartDate: slipBounds.start,
      payEndDate: slipBounds.end,
      daysInPeriod: days,
      fixedMinor,
      variableMinor,
      netMinor: row.net_amount_minor,
    });
  }

  const totalFixedMinor = edrRows.reduce((sum, r) => sum + r.fixedMinor, 0);
  const totalVariableMinor = edrRows.reduce((sum, r) => sum + r.variableMinor, 0);
  const totalSalaryMinor = totalFixedMinor + totalVariableMinor;

  const employerMolId = padNumericDigits(rawEmployerMol, 13) || "0000000000000";
  const employerRoutingCode = rawEmployerRouting || "000000000";

  const now = new Date();
  const createdDate = now.toISOString().slice(0, 10);
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  const yy = String(now.getUTCFullYear()).slice(-2);
  const dateCompact = `${yy}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;

  const employerRef = (options.employerReference || `PAY-${targetYm}`)
    .replace(/[,;\r\n]+/g, " ")
    .trim()
    .slice(0, 35);

  const sifLines: string[] = [];
  for (const row of edrRows) {
    sifLines.push(
      [
        "EDR",
        row.molPersonId,
        row.bankRoutingCode,
        row.iban,
        row.payStartDate,
        row.payEndDate,
        String(row.daysInPeriod),
        formatMinor2dp(row.fixedMinor),
        formatMinor2dp(row.variableMinor),
        "0",
      ].join(","),
    );
  }
  sifLines.push(
    [
      "SCR",
      employerMolId,
      employerRoutingCode,
      createdDate,
      `${hh}${mm}`,
      bounds.mmyyyy,
      String(edrRows.length),
      formatMinor2dp(totalSalaryMinor),
      "AED",
      employerRef,
    ].join(","),
  );

  const filename = `${employerMolId}${dateCompact}${hh}${mm}${ss}.SIF`;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    filename,
    sifContent: `${sifLines.join("\r\n")}\r\n`,
    summary: {
      employerMolId,
      employerRoutingCode,
      salaryMonthMmyyyy: bounds.mmyyyy,
      edrCount: edrRows.length,
      totalFixedMinor,
      totalVariableMinor,
      totalSalaryMinor,
      currency: "AED",
    },
    rows: edrRows,
  };
}
