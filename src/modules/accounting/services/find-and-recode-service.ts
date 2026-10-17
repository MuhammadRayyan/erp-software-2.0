import { getBusinessDb } from "@/core/db/business";
import { addMinor, calculateTax } from "@/modules/accounting/calculations/money";
import { assertFinancialLock } from "@/modules/accounting/services/financial-lock-service";
import { postSalesInvoice } from "@/modules/accounting/services/invoice-posting-service";
import { postPurchaseInvoice } from "@/modules/accounting/services/purchase-invoice-posting-service";
import { postBankTransaction } from "@/modules/banking/bank-transaction-posting";
import { storedRateSnapshot } from "@/modules/currency/validation";
import { replaceTaxEntries } from "@/modules/tax/tax-entry-service";
import { assertVatDateUnlocked } from "@/modules/tax/tax-lock-service";

export type RecodableSourceType =
  | "sales_invoice"
  | "purchase_invoice"
  | "bank_transaction"
  | "manual_journal";

export type FindLinesFilters = {
  sourceType?: "all" | RecodableSourceType;
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  taxCodeId?: string;
  projectId?: string;
  query?: string;
  limit?: number;
};

export type RecodableLine = {
  lineId: string;
  sourceType: RecodableSourceType;
  sourceId: string;
  sourceNumber: string;
  date: string;
  partyName: string;
  description: string;
  accountId: string;
  accountName: string;
  accountType: string;
  taxCodeId: string | null;
  taxCodeName: string | null;
  projectId: string | null;
  projectName: string | null;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
  currencyCode: string;
  isLocked: boolean;
};

export type RecodeAction =
  | { type: "account"; targetAccountId: string }
  | { type: "project"; targetProjectId: string | null }
  | { type: "taxCode"; targetTaxCodeId: string };

export type RecodePayload = {
  lines: Array<{
    lineId: string;
    sourceType: RecodableSourceType;
    sourceId: string;
  }>;
  action: RecodeAction;
};

export function findRecodableLines(
  businessId: string,
  userId: string,
  filters: FindLinesFilters = {},
): RecodableLine[] {
  const { sqlite } = getBusinessDb(businessId, userId);

  const lockRow = sqlite
    .prepare("SELECT financial_lock_date FROM business_accounting_settings WHERE id = 'default'")
    .get() as { financial_lock_date: string | null } | undefined;
  const lockDate = lockRow?.financial_lock_date ?? null;

  const sourceType = filters.sourceType ?? "all";
  const limit = Math.min(500, Math.max(1, filters.limit ?? 250));

  const queries: string[] = [];
  const params: unknown[] = [];

  // 1. Sales Invoices
  if (sourceType === "all" || sourceType === "sales_invoice") {
    let where = "si.document_status = 'posted'";
    const qParams: unknown[] = [];

    if (filters.dateFrom) {
      where += " AND si.invoice_date >= ?";
      qParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      where += " AND si.invoice_date <= ?";
      qParams.push(filters.dateTo);
    }
    if (filters.accountId) {
      where += " AND sil.sales_account_id = ?";
      qParams.push(filters.accountId);
    }
    if (filters.taxCodeId) {
      where += " AND sil.tax_code_id = ?";
      qParams.push(filters.taxCodeId);
    }
    if (filters.projectId) {
      if (filters.projectId === "none") {
        where += " AND (sil.project_id IS NULL AND si.project_id IS NULL)";
      } else {
        where += " AND (sil.project_id = ? OR (sil.project_id IS NULL AND si.project_id = ?))";
        qParams.push(filters.projectId, filters.projectId);
      }
    }
    if (filters.query) {
      const term = `%${filters.query.trim()}%`;
      where += " AND (sil.description LIKE ? OR si.invoice_number LIKE ? OR c.name LIKE ?)";
      qParams.push(term, term, term);
    }

    queries.push(`
      SELECT 
        'sales_invoice' AS source_type,
        sil.id AS line_id,
        si.id AS source_id,
        si.invoice_number AS source_number,
        si.invoice_date AS date,
        c.name AS party_name,
        sil.description,
        sil.sales_account_id AS account_id,
        a.name AS account_name,
        a.type AS account_type,
        tc.id AS tax_code_id,
        tc.name AS tax_code_name,
        COALESCE(sil.project_id, si.project_id) AS project_id,
        p.name AS project_name,
        sil.net_amount_minor,
        sil.tax_amount_minor,
        sil.gross_amount_minor,
        si.currency_code
      FROM sales_invoice_lines sil
      INNER JOIN sales_invoices si ON si.id = sil.invoice_id
      INNER JOIN customers c ON c.id = si.customer_id
      INNER JOIN accounts a ON a.id = sil.sales_account_id
      LEFT JOIN tax_codes tc ON tc.id = sil.tax_code_id
      LEFT JOIN projects p ON p.id = COALESCE(sil.project_id, si.project_id)
      WHERE ${where}
    `);
    params.push(...qParams);
  }

  // 2. Purchase Invoices
  if (sourceType === "all" || sourceType === "purchase_invoice") {
    let where = "pi.document_status = 'posted'";
    const qParams: unknown[] = [];

    if (filters.dateFrom) {
      where += " AND pi.invoice_date >= ?";
      qParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      where += " AND pi.invoice_date <= ?";
      qParams.push(filters.dateTo);
    }
    if (filters.accountId) {
      where += " AND pil.expense_account_id = ?";
      qParams.push(filters.accountId);
    }
    if (filters.taxCodeId) {
      where += " AND pil.tax_code_id = ?";
      qParams.push(filters.taxCodeId);
    }
    if (filters.projectId) {
      if (filters.projectId === "none") {
        where += " AND (pil.project_id IS NULL AND pi.project_id IS NULL)";
      } else {
        where += " AND (pil.project_id = ? OR (pil.project_id IS NULL AND pi.project_id = ?))";
        qParams.push(filters.projectId, filters.projectId);
      }
    }
    if (filters.query) {
      const term = `%${filters.query.trim()}%`;
      where += " AND (pil.description LIKE ? OR pi.internal_number LIKE ? OR pi.supplier_invoice_number LIKE ? OR s.name LIKE ?)";
      qParams.push(term, term, term, term);
    }

    queries.push(`
      SELECT 
        'purchase_invoice' AS source_type,
        pil.id AS line_id,
        pi.id AS source_id,
        pi.internal_number AS source_number,
        pi.invoice_date AS date,
        s.name AS party_name,
        pil.description,
        pil.expense_account_id AS account_id,
        a.name AS account_name,
        a.type AS account_type,
        tc.id AS tax_code_id,
        tc.name AS tax_code_name,
        COALESCE(pil.project_id, pi.project_id) AS project_id,
        p.name AS project_name,
        pil.net_amount_minor,
        pil.tax_amount_minor,
        pil.gross_amount_minor,
        pi.currency_code
      FROM purchase_invoice_lines pil
      INNER JOIN purchase_invoices pi ON pi.id = pil.purchase_invoice_id
      INNER JOIN suppliers s ON s.id = pi.supplier_id
      INNER JOIN accounts a ON a.id = pil.expense_account_id
      LEFT JOIN tax_codes tc ON tc.id = pil.tax_code_id
      LEFT JOIN projects p ON p.id = COALESCE(pil.project_id, pi.project_id)
      WHERE ${where}
    `);
    params.push(...qParams);
  }

  // 3. Bank Transactions
  if (sourceType === "all" || sourceType === "bank_transaction") {
    let where = "bt.document_status = 'posted'";
    const qParams: unknown[] = [];

    if (filters.dateFrom) {
      where += " AND bt.date >= ?";
      qParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      where += " AND bt.date <= ?";
      qParams.push(filters.dateTo);
    }
    if (filters.accountId) {
      where += " AND btl.account_id = ?";
      qParams.push(filters.accountId);
    }
    if (filters.taxCodeId) {
      where += " AND btl.tax_code_id = ?";
      qParams.push(filters.taxCodeId);
    }
    if (filters.projectId) {
      if (filters.projectId === "none") {
        where += " AND btl.project_id IS NULL";
      } else {
        where += " AND btl.project_id = ?";
        qParams.push(filters.projectId);
      }
    }
    if (filters.query) {
      const term = `%${filters.query.trim()}%`;
      where += " AND (btl.description LIKE ? OR bt.transaction_number LIKE ? OR bt.reference LIKE ?)";
      qParams.push(term, term, term);
    }

    queries.push(`
      SELECT 
        'bank_transaction' AS source_type,
        btl.id AS line_id,
        bt.id AS source_id,
        bt.transaction_number AS source_number,
        bt.date AS date,
        COALESCE(bt.reference, bt.description) AS party_name,
        btl.description,
        btl.account_id,
        a.name AS account_name,
        a.type AS account_type,
        tc.id AS tax_code_id,
        tc.name AS tax_code_name,
        btl.project_id,
        p.name AS project_name,
        btl.net_amount_minor,
        btl.tax_amount_minor,
        btl.gross_amount_minor,
        ba.currency_code
      FROM bank_transaction_lines btl
      INNER JOIN bank_transactions bt ON bt.id = btl.bank_transaction_id
      INNER JOIN bank_accounts ba ON ba.id = bt.bank_account_id
      INNER JOIN accounts a ON a.id = btl.account_id
      LEFT JOIN tax_codes tc ON tc.id = btl.tax_code_id
      LEFT JOIN projects p ON p.id = btl.project_id
      WHERE ${where}
    `);
    params.push(...qParams);
  }

  // 4. Manual Journals
  if (sourceType === "all" || sourceType === "manual_journal") {
    let where = "je.status = 'posted' AND je.source_type IN ('manual', 'journal_entry')";
    const qParams: unknown[] = [];

    if (filters.dateFrom) {
      where += " AND je.date >= ?";
      qParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      where += " AND je.date <= ?";
      qParams.push(filters.dateTo);
    }
    if (filters.accountId) {
      where += " AND jl.account_id = ?";
      qParams.push(filters.accountId);
    }
    if (filters.taxCodeId) {
      // Manual journals do not have tax codes directly on lines
      where += " AND 1=0";
    }
    if (filters.projectId) {
      if (filters.projectId === "none") {
        where += " AND jl.project_id IS NULL";
      } else {
        where += " AND jl.project_id = ?";
        qParams.push(filters.projectId);
      }
    }
    if (filters.query) {
      const term = `%${filters.query.trim()}%`;
      where += " AND (jl.description LIKE ? OR je.entry_number LIKE ? OR je.description LIKE ?)";
      qParams.push(term, term, term);
    }

    queries.push(`
      SELECT 
        'manual_journal' AS source_type,
        jl.id AS line_id,
        je.id AS source_id,
        je.entry_number AS source_number,
        je.date AS date,
        COALESCE(c.name, s.name, je.description) AS party_name,
        jl.description,
        jl.account_id,
        a.name AS account_name,
        a.type AS account_type,
        NULL AS tax_code_id,
        NULL AS tax_code_name,
        jl.project_id,
        p.name AS project_name,
        CASE WHEN jl.debit_minor > 0 THEN jl.debit_minor ELSE jl.credit_minor END AS net_amount_minor,
        0 AS tax_amount_minor,
        CASE WHEN jl.debit_minor > 0 THEN jl.debit_minor ELSE jl.credit_minor END AS gross_amount_minor,
        'AED' AS currency_code
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      INNER JOIN accounts a ON a.id = jl.account_id
      LEFT JOIN projects p ON p.id = jl.project_id
      LEFT JOIN customers c ON c.id = jl.customer_id
      LEFT JOIN suppliers s ON s.id = jl.supplier_id
      WHERE ${where}
    `);
    params.push(...qParams);
  }

  if (queries.length === 0) return [];

  const fullUnionSql = `
    SELECT * FROM (
      ${queries.join("\nUNION ALL\n")}
    )
    ORDER BY date DESC, source_number DESC
    LIMIT ?
  `;
  params.push(limit);

  const rawRows = sqlite.prepare(fullUnionSql).all(...params) as Array<{
    source_type: RecodableSourceType;
    line_id: string;
    source_id: string;
    source_number: string;
    date: string;
    party_name: string;
    description: string;
    account_id: string;
    account_name: string;
    account_type: string;
    tax_code_id: string | null;
    tax_code_name: string | null;
    project_id: string | null;
    project_name: string | null;
    net_amount_minor: number;
    tax_amount_minor: number;
    gross_amount_minor: number;
    currency_code: string;
  }>;

  return rawRows.map((r) => {
    const isLocked = Boolean(lockDate && r.date <= lockDate);
    return {
      lineId: r.line_id,
      sourceType: r.source_type,
      sourceId: r.source_id,
      sourceNumber: r.source_number,
      date: r.date,
      partyName: r.party_name,
      description: r.description,
      accountId: r.account_id,
      accountName: r.account_name,
      accountType: r.account_type,
      taxCodeId: r.tax_code_id,
      taxCodeName: r.tax_code_name,
      projectId: r.project_id,
      projectName: r.project_name,
      netAmountMinor: Number(r.net_amount_minor),
      taxAmountMinor: Number(r.tax_amount_minor),
      grossAmountMinor: Number(r.gross_amount_minor),
      currencyCode: r.currency_code,
      isLocked,
    };
  });
}

export function recodeSelectedLines(
  businessId: string,
  userId: string,
  payload: RecodePayload,
): {
  success: boolean;
  updatedLines: number;
  updatedDocuments: number;
  message: string;
} {
  const { sqlite } = getBusinessDb(businessId, userId);

  if (!payload.lines || payload.lines.length === 0) {
    throw new Error("No transaction lines were selected for recoding.");
  }

  // 1. Validation for target entities
  if (payload.action.type === "account") {
    const targetAccountId = payload.action.targetAccountId;
    const account = sqlite
      .prepare("SELECT id, name, type, is_active FROM accounts WHERE id = ?")
      .get(targetAccountId) as { id: string; name: string; type: string; is_active: number } | undefined;
    if (!account || !account.is_active) {
      throw new Error("Target account does not exist or is inactive.");
    }
    // Disallow system control accounts
    const settings = sqlite
      .prepare(`
        SELECT accounts_receivable_account_id, accounts_payable_account_id
        FROM business_accounting_settings WHERE id = 'default'
      `)
      .get() as { accounts_receivable_account_id: string; accounts_payable_account_id: string } | undefined;
    if (
      settings &&
      (targetAccountId === settings.accounts_receivable_account_id ||
        targetAccountId === settings.accounts_payable_account_id)
    ) {
      throw new Error("Cannot recode lines directly into Accounts Receivable or Accounts Payable control accounts.");
    }
  } else if (payload.action.type === "project") {
    if (payload.action.targetProjectId) {
      const project = sqlite
        .prepare("SELECT id, is_active FROM projects WHERE id = ?")
        .get(payload.action.targetProjectId) as { id: string; is_active: number } | undefined;
      if (!project || !project.is_active) {
        throw new Error("Target project does not exist or is inactive.");
      }
    }
  } else if (payload.action.type === "taxCode") {
    const taxCode = sqlite
      .prepare("SELECT id, is_active, rate_basis_points FROM tax_codes WHERE id = ?")
      .get(payload.action.targetTaxCodeId) as
      | { id: string; is_active: number; rate_basis_points: number }
      | undefined;
    if (!taxCode || !taxCode.is_active) {
      throw new Error("Target tax code does not exist or is inactive.");
    }
  }

  // Execute in an atomic transaction
  return sqlite.transaction(() => {
    let affectedLinesCount = 0;
    const affectedDocIds = new Set<string>();

    // Group selected lines by sourceType and sourceId
    const salesInvoices = new Map<string, string[]>();
    const purchaseInvoices = new Map<string, string[]>();
    const bankTransactions = new Map<string, string[]>();
    const manualJournals = new Map<string, string[]>();

    for (const item of payload.lines) {
      if (item.sourceType === "sales_invoice") {
        const list = salesInvoices.get(item.sourceId) ?? [];
        list.push(item.lineId);
        salesInvoices.set(item.sourceId, list);
      } else if (item.sourceType === "purchase_invoice") {
        const list = purchaseInvoices.get(item.sourceId) ?? [];
        list.push(item.lineId);
        purchaseInvoices.set(item.sourceId, list);
      } else if (item.sourceType === "bank_transaction") {
        const list = bankTransactions.get(item.sourceId) ?? [];
        list.push(item.lineId);
        bankTransactions.set(item.sourceId, list);
      } else if (item.sourceType === "manual_journal") {
        const list = manualJournals.get(item.sourceId) ?? [];
        list.push(item.lineId);
        manualJournals.set(item.sourceId, list);
      }
    }

    // 1. Process Sales Invoices
    for (const [invoiceId, lineIds] of salesInvoices) {
      const inv = sqlite
        .prepare("SELECT * FROM sales_invoices WHERE id = ?")
        .get(invoiceId) as any;
      if (!inv || inv.document_status !== "posted") continue;

      assertFinancialLock(sqlite, inv.invoice_date, "Recode Transactions");
      const invTaxCodeIds = (sqlite
        .prepare("SELECT tax_code_id FROM sales_invoice_lines WHERE invoice_id = ?")
        .all(invoiceId) as Array<{ tax_code_id: string | null }>)
        .map((r) => r.tax_code_id)
        .filter((id): id is string => Boolean(id));
      assertVatDateUnlocked(sqlite, inv.tax_date, invTaxCodeIds);

      const customer = sqlite.prepare("SELECT name FROM customers WHERE id = ?").get(inv.customer_id) as { name: string };

      for (const lineId of lineIds) {
        if (payload.action.type === "account") {
          sqlite
            .prepare("UPDATE sales_invoice_lines SET sales_account_id = ? WHERE id = ? AND invoice_id = ?")
            .run(payload.action.targetAccountId, lineId, invoiceId);
        } else if (payload.action.type === "project") {
          sqlite
            .prepare("UPDATE sales_invoice_lines SET project_id = ? WHERE id = ? AND invoice_id = ?")
            .run(payload.action.targetProjectId, lineId, invoiceId);
        } else if (payload.action.type === "taxCode") {
          // Recalculate line tax
          const targetTax = sqlite.prepare("SELECT rate_basis_points FROM tax_codes WHERE id = ?").get(payload.action.targetTaxCodeId) as { rate_basis_points: number };
          const line = sqlite.prepare("SELECT net_amount_minor FROM sales_invoice_lines WHERE id = ?").get(lineId) as { net_amount_minor: number };
          const newTaxMinor = calculateTax(line.net_amount_minor, targetTax.rate_basis_points);
          const newGrossMinor = line.net_amount_minor + newTaxMinor;
          sqlite
            .prepare(`
              UPDATE sales_invoice_lines
              SET tax_code_id = ?, tax_amount_minor = ?, gross_amount_minor = ?
              WHERE id = ? AND invoice_id = ?
            `)
            .run(payload.action.targetTaxCodeId, newTaxMinor, newGrossMinor, lineId, invoiceId);
        }
        affectedLinesCount += 1;
      }

      // Re-read all lines for this invoice
      const allLines = sqlite
        .prepare(`
          SELECT id, sales_account_id, tax_code_id, project_id, net_amount_minor, tax_amount_minor, gross_amount_minor
          FROM sales_invoice_lines
          WHERE invoice_id = ?
          ORDER BY position
        `)
        .all(invoiceId) as Array<{
        id: string;
        sales_account_id: string;
        tax_code_id: string;
        project_id: string | null;
        net_amount_minor: number;
        tax_amount_minor: number;
        gross_amount_minor: number;
      }>;

      // Update invoice totals if tax was changed
      let invTotalMinor = inv.total_minor;
      if (payload.action.type === "taxCode") {
        const newSubtotal = addMinor(allLines.map((l) => l.net_amount_minor));
        const newTax = addMinor(allLines.map((l) => l.tax_amount_minor));
        invTotalMinor = newSubtotal + newTax;
        sqlite
          .prepare(`
            UPDATE sales_invoices
            SET subtotal_minor = ?, tax_minor = ?, total_minor = ?,
                base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?,
                updated_at = ?
            WHERE id = ?
          `)
          .run(newSubtotal, newTax, invTotalMinor, newSubtotal, newTax, invTotalMinor, new Date().toISOString(), invoiceId);
      }

      const rate = storedRateSnapshot(sqlite, {
        currencyCode: inv.currency_code,
        exchangeRateToBase: inv.exchange_rate_to_base,
        exchangeRateDate: inv.exchange_rate_date,
        exchangeRateSource: inv.exchange_rate_source,
      });

      // Re-post journal entry with replace = true
      postSalesInvoice(
        sqlite,
        {
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          customerId: inv.customer_id,
          invoiceDate: inv.invoice_date,
          totalMinor: invTotalMinor,
          rate,
        },
        allLines.map((l) => ({
          salesAccountId: l.sales_account_id,
          taxCodeId: l.tax_code_id,
          projectId: l.project_id,
          netAmountMinor: l.net_amount_minor,
          taxAmountMinor: l.tax_amount_minor,
        })),
        true, // replace
      );

      // Re-replace tax entries
      replaceTaxEntries(
        sqlite,
        {
          sourceType: "sales_invoice",
          sourceId: inv.id,
          sourceNumber: inv.invoice_number,
          partyName: customer.name,
          taxDate: inv.tax_date,
          direction: "sales",
          supplyEmirate: inv.supply_emirate || null,
          rate,
        },
        allLines.map((l) => ({
          id: l.id,
          salesAccountId: l.sales_account_id,
          taxCodeId: l.tax_code_id,
          projectId: l.project_id,
          netAmountMinor: l.net_amount_minor,
          taxAmountMinor: l.tax_amount_minor,
        })),
      );

      affectedDocIds.add(invoiceId);
    }

    // 2. Process Purchase Invoices
    for (const [billId, lineIds] of purchaseInvoices) {
      const bill = sqlite
        .prepare("SELECT * FROM purchase_invoices WHERE id = ?")
        .get(billId) as any;
      if (!bill || bill.document_status !== "posted") continue;

      assertFinancialLock(sqlite, bill.invoice_date, "Recode Transactions");
      const billTaxCodeIds = (sqlite
        .prepare("SELECT tax_code_id FROM purchase_invoice_lines WHERE purchase_invoice_id = ?")
        .all(billId) as Array<{ tax_code_id: string | null }>)
        .map((r) => r.tax_code_id)
        .filter((id): id is string => Boolean(id));
      assertVatDateUnlocked(sqlite, bill.tax_date, billTaxCodeIds);

      const supplier = sqlite.prepare("SELECT name FROM suppliers WHERE id = ?").get(bill.supplier_id) as { name: string };

      for (const lineId of lineIds) {
        if (payload.action.type === "account") {
          sqlite
            .prepare("UPDATE purchase_invoice_lines SET expense_account_id = ? WHERE id = ? AND purchase_invoice_id = ?")
            .run(payload.action.targetAccountId, lineId, billId);
        } else if (payload.action.type === "project") {
          sqlite
            .prepare("UPDATE purchase_invoice_lines SET project_id = ? WHERE id = ? AND purchase_invoice_id = ?")
            .run(payload.action.targetProjectId, lineId, billId);
        } else if (payload.action.type === "taxCode") {
          const targetTax = sqlite.prepare("SELECT rate_basis_points FROM tax_codes WHERE id = ?").get(payload.action.targetTaxCodeId) as { rate_basis_points: number };
          const line = sqlite.prepare("SELECT net_amount_minor FROM purchase_invoice_lines WHERE id = ?").get(lineId) as { net_amount_minor: number };
          const newTaxMinor = calculateTax(line.net_amount_minor, targetTax.rate_basis_points);
          const newGrossMinor = line.net_amount_minor + newTaxMinor;
          sqlite
            .prepare(`
              UPDATE purchase_invoice_lines
              SET tax_code_id = ?, tax_amount_minor = ?, gross_amount_minor = ?
              WHERE id = ? AND purchase_invoice_id = ?
            `)
            .run(payload.action.targetTaxCodeId, newTaxMinor, newGrossMinor, lineId, billId);
        }
        affectedLinesCount += 1;
      }

      const allLines = sqlite
        .prepare(`
          SELECT id, expense_account_id, tax_code_id, project_id, item_id, net_amount_minor, tax_amount_minor, gross_amount_minor
          FROM purchase_invoice_lines
          WHERE purchase_invoice_id = ?
          ORDER BY position
        `)
        .all(billId) as Array<{
        id: string;
        expense_account_id: string;
        tax_code_id: string;
        project_id: string | null;
        item_id: string | null;
        net_amount_minor: number;
        tax_amount_minor: number;
        gross_amount_minor: number;
      }>;

      let billTotalMinor = bill.total_minor;
      if (payload.action.type === "taxCode") {
        const newSubtotal = addMinor(allLines.map((l) => l.net_amount_minor));
        const newTax = addMinor(allLines.map((l) => l.tax_amount_minor));
        billTotalMinor = newSubtotal + newTax;
        sqlite
          .prepare(`
            UPDATE purchase_invoices
            SET subtotal_minor = ?, tax_minor = ?, total_minor = ?,
                base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?,
                updated_at = ?
            WHERE id = ?
          `)
          .run(newSubtotal, newTax, billTotalMinor, newSubtotal, newTax, billTotalMinor, new Date().toISOString(), billId);
      }

      const rate = storedRateSnapshot(sqlite, {
        currencyCode: bill.currency_code,
        exchangeRateToBase: bill.exchange_rate_to_base,
        exchangeRateDate: bill.exchange_rate_date,
        exchangeRateSource: bill.exchange_rate_source,
      });

      postPurchaseInvoice(
        sqlite,
        {
          id: bill.id,
          internalNumber: bill.internal_number,
          supplierId: bill.supplier_id,
          invoiceDate: bill.invoice_date,
          totalMinor: billTotalMinor,
          rate,
        },
        allLines.map((l) => ({
          expenseAccountId: l.expense_account_id,
          taxCodeId: l.tax_code_id,
          projectId: l.project_id,
          itemId: l.item_id,
          netAmountMinor: l.net_amount_minor,
          taxAmountMinor: l.tax_amount_minor,
          grossAmountMinor: l.gross_amount_minor,
        })),
        true, // replace
      );

      replaceTaxEntries(
        sqlite,
        {
          sourceType: "purchase_invoice",
          sourceId: bill.id,
          sourceNumber: bill.internal_number,
          partyName: supplier.name,
          taxDate: bill.tax_date,
          direction: "purchases",
          rate,
        },
        allLines.map((l) => ({
          id: l.id,
          salesAccountId: l.expense_account_id,
          taxCodeId: l.tax_code_id,
          projectId: l.project_id,
          netAmountMinor: l.net_amount_minor,
          taxAmountMinor: l.tax_amount_minor,
        })),
      );

      affectedDocIds.add(billId);
    }

    // 3. Process Bank Transactions
    for (const [btId, lineIds] of bankTransactions) {
      const bt = sqlite
        .prepare("SELECT * FROM bank_transactions WHERE id = ?")
        .get(btId) as any;
      if (!bt || bt.document_status !== "posted") continue;

      assertFinancialLock(sqlite, bt.date, "Recode Transactions");

      const bankAcc = sqlite
        .prepare("SELECT ledger_account_id FROM bank_accounts WHERE id = ?")
        .get(bt.bank_account_id) as { ledger_account_id: string };

      for (const lineId of lineIds) {
        if (payload.action.type === "account") {
          sqlite
            .prepare("UPDATE bank_transaction_lines SET account_id = ? WHERE id = ? AND bank_transaction_id = ?")
            .run(payload.action.targetAccountId, lineId, btId);
        } else if (payload.action.type === "project") {
          sqlite
            .prepare("UPDATE bank_transaction_lines SET project_id = ? WHERE id = ? AND bank_transaction_id = ?")
            .run(payload.action.targetProjectId, lineId, btId);
        } else if (payload.action.type === "taxCode") {
          const targetTax = sqlite.prepare("SELECT rate_basis_points FROM tax_codes WHERE id = ?").get(payload.action.targetTaxCodeId) as { rate_basis_points: number };
          const line = sqlite.prepare("SELECT net_amount_minor FROM bank_transaction_lines WHERE id = ?").get(lineId) as { net_amount_minor: number };
          const newTaxMinor = calculateTax(line.net_amount_minor, targetTax.rate_basis_points);
          const newGrossMinor = line.net_amount_minor + newTaxMinor;
          sqlite
            .prepare(`
              UPDATE bank_transaction_lines
              SET tax_code_id = ?, tax_amount_minor = ?, gross_amount_minor = ?
              WHERE id = ? AND bank_transaction_id = ?
            `)
            .run(payload.action.targetTaxCodeId, newTaxMinor, newGrossMinor, lineId, btId);
        }
        affectedLinesCount += 1;
      }

      const allLines = sqlite
        .prepare(`
          SELECT account_id, tax_code_id, project_id, description, net_amount_minor, tax_amount_minor, gross_amount_minor
          FROM bank_transaction_lines
          WHERE bank_transaction_id = ?
          ORDER BY position
        `)
        .all(btId) as Array<{
        account_id: string;
        tax_code_id: string;
        project_id: string | null;
        description: string;
        net_amount_minor: number;
        tax_amount_minor: number;
        gross_amount_minor: number;
      }>;

      let btTotalMinor = bt.total_minor;
      if (payload.action.type === "taxCode") {
        btTotalMinor = addMinor(allLines.map((l) => l.gross_amount_minor));
        sqlite
          .prepare("UPDATE bank_transactions SET total_minor = ?, updated_at = ? WHERE id = ?")
          .run(btTotalMinor, new Date().toISOString(), btId);
      }

      postBankTransaction(
        sqlite,
        {
          id: bt.id,
          transactionNumber: bt.transaction_number,
          bankLedgerAccountId: bankAcc.ledger_account_id,
          date: bt.date,
          type: bt.type,
          totalMinor: btTotalMinor,
          description: bt.description,
        },
        allLines.map((l) => ({
          accountId: l.account_id,
          taxCodeId: l.tax_code_id,
          projectId: l.project_id,
          description: l.description,
          netAmountMinor: l.net_amount_minor,
          taxAmountMinor: l.tax_amount_minor,
        })),
        true, // replace = true
      );

      affectedDocIds.add(btId);
    }

    // 4. Process Manual Journals
    for (const [jeId, lineIds] of manualJournals) {
      const je = sqlite
        .prepare("SELECT * FROM journal_entries WHERE id = ?")
        .get(jeId) as any;
      if (!je || je.status !== "posted") continue;

      assertFinancialLock(sqlite, je.date, "Recode Transactions");

      for (const lineId of lineIds) {
        if (payload.action.type === "account") {
          sqlite
            .prepare("UPDATE journal_lines SET account_id = ? WHERE id = ? AND journal_entry_id = ?")
            .run(payload.action.targetAccountId, lineId, jeId);
        } else if (payload.action.type === "project") {
          sqlite
            .prepare("UPDATE journal_lines SET project_id = ? WHERE id = ? AND journal_entry_id = ?")
            .run(payload.action.targetProjectId, lineId, jeId);
        }
        affectedLinesCount += 1;
      }

      affectedDocIds.add(jeId);
    }

    return {
      success: true,
      updatedLines: affectedLinesCount,
      updatedDocuments: affectedDocIds.size,
      message: `Successfully recoded ${affectedLinesCount} line(s) across ${affectedDocIds.size} document(s).`,
    };
  })();
}
