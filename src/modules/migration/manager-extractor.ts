import Database from "better-sqlite3";
import {
  decodeProtobuf,
  decodeManagerDate,
  decodeManagerDecimal,
  resolveGuidSubmessage,
} from "./manager-protobuf";

export interface ManagerExtractedData {
  business: {
    name: string;
    legalName?: string;
    trn?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    country: string;
    currency: string;
    financialYearStartMonth: number;
  };
  accounts: Array<{
    id: string;
    name: string;
    type: "asset" | "liability" | "equity" | "income" | "expense";
    subtype: string;
  }>;
  bankAccounts: Array<{
    id: string;
    name: string;
    code?: string;
    currency: string;
    type: "bank" | "cash";
  }>;
  customers: Array<{
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    trn?: string;
  }>;
  suppliers: Array<{
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    trn?: string;
  }>;
  inventoryItems: Array<{
    id: string;
    code?: string;
    name: string;
    unitOfMeasure: string;
    salesUnitPrice: number;
    purchaseUnitPrice: number;
  }>;
  fixedAssets: Array<{
    id: string;
    name: string;
    category?: string;
  }>;
  projects: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  customFields: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  salesInvoices: Array<{
    id: string;
    invoiceNumber: string;
    issueDate: string;
    customerId: string;
    projectId?: string;
    notes?: string;
    lines: Array<{
      itemId?: string;
      description: string;
      quantity: number;
      unitPrice: number;
      projectId?: string;
    }>;
    customFieldValues: Record<string, string>;
  }>;
  salesQuotes: Array<{
    id: string;
    quoteNumber: string;
    issueDate: string;
    title: string;
    customerId?: string;
    lines: Array<{
      itemId?: string;
      description: string;
      quantity: number;
      unitPrice: number;
    }>;
  }>;
  salesOrders: Array<{
    id: string;
    orderNumber: string;
    orderDate: string;
    customerId: string;
    salesQuoteId?: string;
    notes?: string;
    lines: Array<{
      itemId?: string;
      description: string;
      quantity: number;
      unitPrice: number;
    }>;
  }>;
  purchaseInvoices: Array<{
    id: string;
    invoiceNumber: string;
    issueDate: string;
    supplierId: string;
    projectId?: string;
    notes?: string;
    lines: Array<{
      itemId?: string;
      description: string;
      quantity: number;
      unitPrice: number;
      projectId?: string;
    }>;
  }>;
  receipts: Array<{
    id: string;
    receiptNumber: string;
    receiptDate: string;
    accountId?: string;
    customerId?: string;
    amount: number;
    description: string;
    allocations: Array<{
      invoiceId: string;
      amount: number;
    }>;
  }>;
  payments: Array<{
    id: string;
    paymentNumber: string;
    paymentDate: string;
    accountId?: string;
    supplierId?: string;
    amount: number;
    description: string;
    allocations: Array<{
      invoiceId: string;
      amount: number;
    }>;
  }>;
  bankTransfers: Array<{
    id: string;
    transferDate: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    description: string;
  }>;
  employees: Array<{
    id: string;
    name: string;
    address?: string;
  }>;
  payslips: Array<{
    id: string;
    payslipNumber: string;
    employeeId: string;
    date: string;
    periodDescription?: string;
    grossAmount: number;
    deductions: number;
    netAmount: number;
    notes?: string;
  }>;
  journalEntries: Array<{
    id: string;
    entryNumber: string;
    date: string;
    narration: string;
    lines: Array<{
      accountId: string;
      description: string;
      debit: number;
      credit: number;
    }>;
  }>;
}

// Well-known Manager.io ContentType UUIDs (both Legacy and Modern formats)
export const MANAGER_CONTENT_TYPES = {
  BUSINESS_DETAILS: "38cf4712-6e95-4ce1-b53a-bff03edad273",
  LOCALIZATION_SETTINGS: "a56e89d1-7bee-4509-8b84-c9ebc3808b0c",
  CUSTOMERS: "ec37c11e-2b67-49c6-8a58-6eccb7dd75ee",
  SUPPLIERS: "6d2dc48d-2053-4e45-8330-285ebd431242",
  INVENTORY_ITEMS: "0dbdbf8a-d80c-48e6-b453-bb7862445b7c",
  FIXED_ASSETS: "00082353-9fca-4ab4-91ae-20505479cbda",
  PROJECTS_TRACKING_CODES: "5170f738-cfba-42e3-bb8e-a7d5c5ab66f2",
  CHART_OF_ACCOUNTS: "26b9e4a5-ce10-4f30-94c7-23a1ca4428f9",
  BANK_AND_CASH_ACCOUNTS: "1408c33b-6284-4f50-9e31-48cbea21f3cf",
  SPECIAL_ACCOUNTS: "6ef13e42-ad89-4d42-9480-546e0c04a411",
  ACCOUNT_GROUPS: "5770616c-0e01-46ca-a172-f7042275da6c",

  // Invoices (Legacy vs Modern)
  SALES_INVOICES_LEGACY: "a0f6a539-f6a4-4a38-a69a-546a608a1f6d",
  SALES_INVOICES_MODERN: "ad12b60b-23bf-4421-94df-8be79cef533e",

  // Quotes (Legacy vs Modern)
  SALES_QUOTES_LEGACY: "efc4f2cc-acf0-4815-a9a8-13bae00c6167",
  SALES_QUOTES_MODERN: "ba89de75-cb87-4bde-b20f-314f01b31037",

  // Orders
  SALES_ORDERS: "2dac5598-128d-4954-b2e4-21515047b3a7",

  // Bills (Legacy vs Modern)
  PURCHASE_INVOICES_LEGACY: "866217a4-f841-47de-a4e6-87152405c88d",
  PURCHASE_INVOICES_MODERN: "58b9eb90-f6b8-4abc-8ea1-12fd77b8336e",

  // Receipts (Legacy vs Modern)
  RECEIPTS_LEGACY: "c6b97908-627b-453b-9b62-3e6308a96ace",
  RECEIPTS_MODERN: "7662b887-c8d8-486e-98fd-f9dbcd41c6dc",

  // Payments (Legacy vs Modern)
  PAYMENTS_LEGACY: "3c2d2934-27a8-4df3-9afd-890ebeb6fb4e",
  PAYMENTS_MODERN: "79f99d26-e43a-4ecb-a9c9-0774601a9b2e",

  INTER_ACCOUNT_TRANSFERS: "dea4f923-c498-4504-b3ef-30be3c33175e",
  CUSTOM_FIELDS_DEF: "411f5975-0376-4ba9-b7ff-5bb2baa6f69f",
  CUSTOM_FIELD_OPTIONS: "cc7fc110-e3e4-4b3b-823d-86c4a4cdabbc",

  // Contracting Payroll
  EMPLOYEES: "dadb7f95-a5dd-45c0-945d-6ad4ee28776e",
  PAYSLIPS: "1d103fa7-6fc1-4951-811e-972968b842cc",

  // General Journal
  JOURNAL_ENTRIES: "5ea52bc4-90ae-4e4a-aec4-ef1224b279ad",
};

export function extractGuid(sub: any): string | null {
  if (!sub) return null;
  if (typeof sub === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) {
    return sub.toLowerCase();
  }
  if (sub["1"]?._type === "fixed64" && sub["2"]?._type === "fixed64") {
    return resolveGuidSubmessage(sub["1"].rawHex, sub["2"].rawHex);
  }
  return null;
}

export function extractManagerData(sqliteDb: Database.Database): ManagerExtractedData {
  // 1. Business Profile
  let businessName = "Imported Business";
  let addressText = "";
  let trn = "";
  let phone = "";
  let email = "";

  const bizRow = sqliteDb.prepare('SELECT Content FROM "Objects" WHERE ContentType = ?').get(MANAGER_CONTENT_TYPES.BUSINESS_DETAILS) as { Content: Buffer } | undefined;
  if (bizRow) {
    const d = decodeProtobuf(bizRow.Content);
    if (d["1"] && typeof d["1"] === "string") businessName = d["1"].trim();
    if (d["2"] && typeof d["2"] === "string") addressText = d["2"];
  }

  // Parse address, phone, email, and TRN from address block if present
  if (addressText) {
    const trnMatch = addressText.match(/TRN\s*(?:NO)?[:\s]*([0-9]{15})/i);
    if (trnMatch) trn = trnMatch[1];
    const phoneMatch = addressText.match(/(?:Mob|Tel|Phone)[:\s]*([+0-9\s-]{8,20})/i);
    if (phoneMatch) phone = phoneMatch[1].trim();
    const emailMatch = addressText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) email = emailMatch[1];
  }

  // 2. Account Groups (to classify Chart of Accounts)
  const groupMap = new Map<string, "asset" | "liability" | "equity" | "income" | "expense">();
  const groupRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.ACCOUNT_GROUPS) as Array<{ Key: string; Content: Buffer }>;
  for (const g of groupRows) {
    const d = decodeProtobuf(g.Content);
    const gName = String(d["1"] || "").toLowerCase();
    let type: "asset" | "liability" | "equity" | "income" | "expense" = "expense";
    if (gName.includes("income") || gName.includes("revenue")) type = "income";
    else if (gName.includes("asset")) type = "asset";
    else if (gName.includes("liabilit")) type = "liability";
    else if (gName.includes("equity") || gName.includes("capital")) type = "equity";
    groupMap.set(g.Key.toLowerCase(), type);
  }

  // 3. Chart of Accounts
  const accounts: ManagerExtractedData["accounts"] = [];
  const accRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.CHART_OF_ACCOUNTS) as Array<{ Key: string; Content: Buffer }>;
  for (const a of accRows) {
    const d = decodeProtobuf(a.Content);
    const name = String(d["1"] || "General Account").trim();
    const groupGuid = extractGuid(d["3"]);
    const type = (groupGuid && groupMap.get(groupGuid)) || "expense";
    let subtype = "operating_expense";
    if (type === "income") subtype = "operating_revenue";
    else if (type === "asset") subtype = "current_asset";
    else if (type === "liability") subtype = "current_liability";
    else if (type === "equity") subtype = "equity_capital";

    accounts.push({
      id: a.Key.toLowerCase(),
      name,
      type,
      subtype,
    });
  }

  // 4. Bank & Cash Accounts
  const bankAccounts: ManagerExtractedData["bankAccounts"] = [];
  const bankRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.BANK_AND_CASH_ACCOUNTS) as Array<{ Key: string; Content: Buffer }>;
  for (const b of bankRows) {
    const d = decodeProtobuf(b.Content);
    const name = String(d["1"] || "Bank Account").trim();
    const isCash = name.toLowerCase().includes("cash");
    bankAccounts.push({
      id: b.Key.toLowerCase(),
      name,
      currency: "AED",
      type: isCash ? "cash" : "bank",
    });
  }

  // 5. Customers
  const customers: ManagerExtractedData["customers"] = [];
  const custRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.CUSTOMERS) as Array<{ Key: string; Content: Buffer }>;
  for (const c of custRows) {
    const d = decodeProtobuf(c.Content);
    const name = String(d["1"] || "Unnamed Customer").trim();
    const phoneVal = typeof d["2"] === "string" ? d["2"].trim() : undefined;
    const addrVal = typeof d["7"] === "string" ? d["7"].trim() : undefined;
    let custTrn: string | undefined;
    if (d["19"]?.["1"]?.[0]?.["2"]) {
      custTrn = String(d["19"]["1"][0]["2"]);
    } else if (d["19"]?.["1"]?.["2"]) {
      custTrn = String(d["19"]["1"]["2"]);
    }
    customers.push({
      id: c.Key.toLowerCase(),
      name,
      phone: phoneVal,
      address: addrVal,
      trn: custTrn,
    });
  }

  // 6. Suppliers
  const suppliers: ManagerExtractedData["suppliers"] = [];
  const suppRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.SUPPLIERS) as Array<{ Key: string; Content: Buffer }>;
  for (const s of suppRows) {
    const d = decodeProtobuf(s.Content);
    const name = String(d["1"] || "Unnamed Supplier").trim();
    const addrVal = typeof d["7"] === "string" ? d["7"].trim() : undefined;
    let suppTrn: string | undefined;
    if (d["19"]?.["1"]?.[0]?.["2"]) {
      suppTrn = String(d["19"]["1"][0]["2"]);
    } else if (d["19"]?.["1"]?.["2"]) {
      suppTrn = String(d["19"]["1"]["2"]);
    }
    suppliers.push({
      id: s.Key.toLowerCase(),
      name,
      address: addrVal,
      trn: suppTrn,
    });
  }

  // 7. Inventory Items
  const inventoryItems: ManagerExtractedData["inventoryItems"] = [];
  const itemRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.INVENTORY_ITEMS) as Array<{ Key: string; Content: Buffer }>;
  for (const it of itemRows) {
    const d = decodeProtobuf(it.Content);
    const code = typeof d["1"] === "string" ? d["1"].trim() : undefined;
    const name = String(d["11"] || code || "Inventory Item").trim();
    const unitOfMeasure = typeof d["13"] === "string" ? d["13"].trim() : "Units";
    const salesPrice = decodeManagerDecimal(d["2"]);
    const purchasePrice = decodeManagerDecimal(d["3"]);

    inventoryItems.push({
      id: it.Key.toLowerCase(),
      code,
      name,
      unitOfMeasure: unitOfMeasure || "Units",
      salesUnitPrice: salesPrice,
      purchaseUnitPrice: purchasePrice,
    });
  }

  // 8. Fixed Assets
  const fixedAssets: ManagerExtractedData["fixedAssets"] = [];
  const assetRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.FIXED_ASSETS) as Array<{ Key: string; Content: Buffer }>;
  for (const fa of assetRows) {
    const d = decodeProtobuf(fa.Content);
    const name = String(d["1"] || "Fixed Asset").trim();
    const category = typeof d["2"] === "string" ? d["2"].trim() : undefined;
    fixedAssets.push({
      id: fa.Key.toLowerCase(),
      name,
      category,
    });
  }

  // 9. Projects / Job Cards
  const projects: ManagerExtractedData["projects"] = [];
  const projectRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.PROJECTS_TRACKING_CODES) as Array<{ Key: string; Content: Buffer }>;
  for (const pr of projectRows) {
    const d = decodeProtobuf(pr.Content);
    const code = String(d["1"] || pr.Key).trim();
    projects.push({
      id: pr.Key.toLowerCase(),
      code,
      name: code,
    });
  }

  // 10. Custom Fields (Chassis, Service Kms, Plate, etc.)
  const customFields: ManagerExtractedData["customFields"] = [];
  const cfRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.CUSTOM_FIELDS_DEF) as Array<{ Key: string; Content: Buffer }>;
  for (const cf of cfRows) {
    const d = decodeProtobuf(cf.Content);
    const name = String(d["1"] || "Custom Field").trim();
    customFields.push({
      id: cf.Key.toLowerCase(),
      name,
      type: "text",
    });
  }

  // Build Item Lookup Map (by ID) for price fallback
  const itemMap = new Map<string, ManagerExtractedData["inventoryItems"][0]>();
  for (const it of inventoryItems) {
    itemMap.set(it.id, it);
  }

  // 11. Sales Invoices (Support both Legacy and Modern ContentType)
  const salesInvoices: ManagerExtractedData["salesInvoices"] = [];
  const invRows = sqliteDb.prepare(
    'SELECT Key, ContentType, Content FROM "Objects" WHERE ContentType IN (?, ?)'
  ).all(MANAGER_CONTENT_TYPES.SALES_INVOICES_LEGACY, MANAGER_CONTENT_TYPES.SALES_INVOICES_MODERN) as Array<{ Key: string; ContentType: string; Content: Buffer }>;
  let invSeq = 1;
  for (const r of invRows) {
    const d = decodeProtobuf(r.Content);
    const isModern = r.ContentType === MANAGER_CONTENT_TYPES.SALES_INVOICES_MODERN;

    const issueDate = decodeManagerDate(isModern ? d["1"] : d["3"]) || new Date().toISOString().slice(0, 10);
    const customerId = extractGuid(isModern ? d["3"] : d["4"]) || "";
    const notes = typeof (isModern ? d["12"] : d["9"]) === "string" ? (isModern ? d["12"] : d["9"]).trim() : undefined;
    const invNumberFromDoc = typeof d["2"] === "string" ? d["2"].trim() : "";
    const invoiceNumber = invNumberFromDoc || `INV-${String(invSeq++).padStart(5, "0")}`;

    const rawLines = isModern
      ? (Array.isArray(d["49"]) ? d["49"] : (d["49"] ? [d["49"]] : []))
      : (Array.isArray(d["15"]) ? d["15"] : (d["15"] ? [d["15"]] : []));

    const lines: ManagerExtractedData["salesInvoices"][0]["lines"] = [];
    for (const l of rawLines) {
      if (isModern) {
        const itemId = extractGuid(l["2"]);
        const item = itemId ? itemMap.get(itemId) : undefined;
        const description = String(l["17"] || item?.name || "Service Line").trim();
        const quantity = decodeManagerDecimal(l["18"]) || 1;
        let unitPrice = decodeManagerDecimal(l["19"]);
        if (unitPrice === 0 && item) unitPrice = item.salesUnitPrice;
        const lineProjectId = extractGuid(l["26"]) || undefined;
        lines.push({ itemId: itemId || undefined, description, quantity, unitPrice, projectId: lineProjectId });
      } else {
        const itemId = extractGuid(l["1"]);
        const item = itemId ? itemMap.get(itemId) : undefined;
        const description = String(l["2"] || item?.name || "Service Line").trim();
        const quantity = decodeManagerDecimal(l["3"]) || 1;
        let unitPrice = decodeManagerDecimal(l["4"]);
        if (unitPrice === 0 && item) unitPrice = item.salesUnitPrice;
        lines.push({ itemId: itemId || undefined, description, quantity, unitPrice });
      }
    }

    // Extract custom fields (Chassis, Mileage, Plate)
    const customFieldValues: Record<string, string> = {};
    if (d["23"]?.["1"]) {
      const cfArray = Array.isArray(d["23"]["1"]) ? d["23"]["1"] : [d["23"]["1"]];
      for (const cf of cfArray) {
        const fieldGuid = extractGuid(cf["1"]);
        const fieldVal = typeof cf["2"] === "string" ? cf["2"].trim() : "";
        if (fieldGuid && fieldVal) customFieldValues[fieldGuid] = fieldVal;
      }
    }

    salesInvoices.push({
      id: r.Key.toLowerCase(),
      invoiceNumber,
      issueDate,
      customerId,
      notes,
      lines,
      customFieldValues,
    });
  }

  // 12. Sales Quotes (Support both Legacy and Modern ContentType)
  const salesQuotes: ManagerExtractedData["salesQuotes"] = [];
  const quoteRows = sqliteDb.prepare(
    'SELECT Key, ContentType, Content FROM "Objects" WHERE ContentType IN (?, ?)'
  ).all(MANAGER_CONTENT_TYPES.SALES_QUOTES_LEGACY, MANAGER_CONTENT_TYPES.SALES_QUOTES_MODERN) as Array<{ Key: string; ContentType: string; Content: Buffer }>;
  let quoteSeq = 1;
  for (const q of quoteRows) {
    const d = decodeProtobuf(q.Content);
    const isModern = q.ContentType === MANAGER_CONTENT_TYPES.SALES_QUOTES_MODERN;

    const issueDate = decodeManagerDate(d["1"]) || new Date().toISOString().slice(0, 10);
    const quoteNumberFromDoc = typeof d["2"] === "string" ? d["2"].trim() : "";
    const quoteNumber = quoteNumberFromDoc || `SQ-${String(quoteSeq++).padStart(5, "0")}`;
    const customerId = extractGuid(isModern ? d["3"] : d["2"]) || undefined;
    const title = String((isModern ? d["9"] : d["1"]) || "Sales Quote").trim();

    const rawLines = isModern
      ? (Array.isArray(d["24"]) ? d["24"] : (d["24"] ? [d["24"]] : []))
      : (Array.isArray(d["3"]) ? d["3"] : (d["3"] ? [d["3"]] : []));

    const lines: ManagerExtractedData["salesQuotes"][0]["lines"] = [];
    for (const l of rawLines) {
      if (isModern) {
        const description = String(l["2"] || "Quote Item").trim();
        const quantity = decodeManagerDecimal(l["3"]) || 1;
        const unitPrice = decodeManagerDecimal(l["4"]) || 0;
        lines.push({ description, quantity, unitPrice });
      } else {
        const itemId = extractGuid(l["1"]);
        const item = itemId ? itemMap.get(itemId) : undefined;
        const quantity = decodeManagerDecimal(l["3"]) || 1;
        const unitPrice = item ? item.salesUnitPrice : 0;
        lines.push({
          itemId: itemId || undefined,
          description: item?.name || "Quote Item",
          quantity,
          unitPrice,
        });
      }
    }

    salesQuotes.push({
      id: q.Key.toLowerCase(),
      quoteNumber,
      issueDate,
      title,
      customerId,
      lines,
    });
  }

  // 13. Sales Orders
  const salesOrders: ManagerExtractedData["salesOrders"] = [];
  const orderRows = sqliteDb.prepare(
    'SELECT Key, Content FROM "Objects" WHERE ContentType = ?'
  ).all(MANAGER_CONTENT_TYPES.SALES_ORDERS) as Array<{ Key: string; Content: Buffer }>;
  let orderSeq = 1;
  for (const o of orderRows) {
    const d = decodeProtobuf(o.Content);
    const orderDate = decodeManagerDate(d["1"]) || new Date().toISOString().slice(0, 10);
    const orderNumberFromDoc = typeof d["2"] === "string" ? d["2"].trim() : "";
    const orderNumber = orderNumberFromDoc || `SO-${String(orderSeq++).padStart(5, "0")}`;
    const customerId = extractGuid(d["3"]) || "";
    const notes = typeof d["12"] === "string" ? d["12"].trim() : (typeof d["11"] === "string" ? d["11"].trim() : undefined);
    const salesQuoteId = extractGuid(d["19"]) || undefined;

    const rawLines = Array.isArray(d["18"]) ? d["18"] : (d["18"] ? [d["18"]] : []);
    const lines: ManagerExtractedData["salesOrders"][0]["lines"] = [];
    for (const l of rawLines) {
      const description = String(l["2"] || "Order Line Item").trim();
      const quantity = decodeManagerDecimal(l["3"]) || 1;
      const unitPrice = decodeManagerDecimal(l["4"]) || 0;
      lines.push({ description, quantity, unitPrice });
    }

    salesOrders.push({
      id: o.Key.toLowerCase(),
      orderNumber,
      orderDate,
      customerId,
      salesQuoteId,
      notes,
      lines,
    });
  }

  // 14. Purchase Invoices / Bills (Support both Legacy and Modern ContentType)
  const purchaseInvoices: ManagerExtractedData["purchaseInvoices"] = [];
  const billRows = sqliteDb.prepare(
    'SELECT Key, ContentType, Content FROM "Objects" WHERE ContentType IN (?, ?)'
  ).all(MANAGER_CONTENT_TYPES.PURCHASE_INVOICES_LEGACY, MANAGER_CONTENT_TYPES.PURCHASE_INVOICES_MODERN) as Array<{ Key: string; ContentType: string; Content: Buffer }>;
  let billSeq = 1;
  for (const b of billRows) {
    const d = decodeProtobuf(b.Content);
    const isModern = b.ContentType === MANAGER_CONTENT_TYPES.PURCHASE_INVOICES_MODERN;

    const issueDate = decodeManagerDate(isModern ? d["1"] : d["3"]) || new Date().toISOString().slice(0, 10);
    const supplierId = extractGuid(isModern ? d["3"] : d["4"]) || "";
    const billNumFromDoc = typeof d["2"] === "string" ? d["2"].trim() : "";
    const invoiceNumber = billNumFromDoc || `BILL-${String(billSeq++).padStart(5, "0")}`;
    const notes = typeof (isModern ? d["9"] : d["8"]) === "string" ? (isModern ? d["9"] : d["8"]).trim() : undefined;

    const rawLines = isModern
      ? (Array.isArray(d["23"]) ? d["23"] : (d["23"] ? [d["23"]] : (Array.isArray(d["24"]) ? d["24"] : (d["24"] ? [d["24"]] : []))))
      : (Array.isArray(d["15"]) ? d["15"] : (d["15"] ? [d["15"]] : []));

    const lines: ManagerExtractedData["purchaseInvoices"][0]["lines"] = [];
    for (const l of rawLines) {
      if (isModern) {
        const itemId = extractGuid(l["2"]);
        const item = itemId ? itemMap.get(itemId) : undefined;
        const description = String(l["17"] || item?.name || "Purchase Item").trim();
        const quantity = decodeManagerDecimal(l["18"]) || 1;
        let unitPrice = decodeManagerDecimal(l["19"]);
        if (unitPrice === 0 && item) unitPrice = item.purchaseUnitPrice;
        const lineProjectId = extractGuid(l["26"]) || undefined;
        lines.push({ itemId: itemId || undefined, description, quantity, unitPrice, projectId: lineProjectId });
      } else {
        const itemId = extractGuid(l["1"]);
        const item = itemId ? itemMap.get(itemId) : undefined;
        const description = String(l["2"] || item?.name || "Purchase Item").trim();
        const quantity = decodeManagerDecimal(l["3"]) || 1;
        let unitPrice = decodeManagerDecimal(l["4"]);
        if (unitPrice === 0 && item) unitPrice = item.purchaseUnitPrice;
        lines.push({ itemId: itemId || undefined, description, quantity, unitPrice });
      }
    }

    purchaseInvoices.push({
      id: b.Key.toLowerCase(),
      invoiceNumber,
      issueDate,
      supplierId,
      notes,
      lines,
    });
  }

  // 15. Customer Receipts
  const receipts: ManagerExtractedData["receipts"] = [];
  const rcvRows = sqliteDb.prepare(
    'SELECT Key, ContentType, Content FROM "Objects" WHERE ContentType IN (?, ?)'
  ).all(MANAGER_CONTENT_TYPES.RECEIPTS_LEGACY, MANAGER_CONTENT_TYPES.RECEIPTS_MODERN) as Array<{ Key: string; ContentType: string; Content: Buffer }>;
  let rcvSeq = 1;
  for (const r of rcvRows) {
    const d = decodeProtobuf(r.Content);
    const isModern = r.ContentType === MANAGER_CONTENT_TYPES.RECEIPTS_MODERN;

    const receiptDate = decodeManagerDate(d["1"]) || new Date().toISOString().slice(0, 10);
    const receiptNumberFromDoc = typeof d["2"] === "string" ? d["2"].trim() : "";
    const receiptNumber = receiptNumberFromDoc || `RCV-${String(rcvSeq++).padStart(5, "0")}`;
    const accountId = extractGuid(isModern ? d["7"] : d["4"]) || undefined;
    const customerId = extractGuid(isModern ? d["4"] : d["5"]) || undefined;
    const description = String((isModern ? d["10"] : d["2"]) || "Customer Receipt").trim();

    const allocations: ManagerExtractedData["receipts"][0]["allocations"] = [];
    let totalAmount = 0;

    if (isModern && d["11"]) {
      const rawLines = Array.isArray(d["11"]) ? d["11"] : [d["11"]];
      for (const l of rawLines) {
        const invId = extractGuid(l["4"]);
        const lineAmt = decodeManagerDecimal(l["18"]);
        totalAmount += lineAmt;
        if (invId && lineAmt > 0) {
          allocations.push({ invoiceId: invId, amount: lineAmt });
        }
      }
    } else {
      totalAmount = decodeManagerDecimal(d["3"]);
    }

    if (totalAmount <= 0 && d["8"]) {
      totalAmount = decodeManagerDecimal(d["8"]);
    }

    receipts.push({
      id: r.Key.toLowerCase(),
      receiptNumber,
      receiptDate,
      accountId,
      customerId,
      amount: totalAmount,
      description,
      allocations,
    });
  }

  // 16. Supplier Payments
  const payments: ManagerExtractedData["payments"] = [];
  const payRows = sqliteDb.prepare(
    'SELECT Key, ContentType, Content FROM "Objects" WHERE ContentType IN (?, ?)'
  ).all(MANAGER_CONTENT_TYPES.PAYMENTS_LEGACY, MANAGER_CONTENT_TYPES.PAYMENTS_MODERN) as Array<{ Key: string; ContentType: string; Content: Buffer }>;
  let paySeq = 1;
  for (const p of payRows) {
    const d = decodeProtobuf(p.Content);
    const isModern = p.ContentType === MANAGER_CONTENT_TYPES.PAYMENTS_MODERN;

    const paymentDate = decodeManagerDate(d["1"]) || new Date().toISOString().slice(0, 10);
    const payNumberFromDoc = typeof d["2"] === "string" ? d["2"].trim() : "";
    const paymentNumber = payNumberFromDoc || `PAY-${String(paySeq++).padStart(5, "0")}`;
    const accountId = extractGuid(isModern ? d["7"] : d["4"]) || undefined;
    let supplierId = extractGuid(isModern ? undefined : d["5"]) || undefined;
    const description = String((isModern ? d["10"] : d["2"]) || "Supplier Payment").trim();

    const allocations: ManagerExtractedData["payments"][0]["allocations"] = [];
    let totalAmount = 0;

    if (isModern && d["11"]) {
      const rawLines = Array.isArray(d["11"]) ? d["11"] : [d["11"]];
      for (const l of rawLines) {
        const lineSuppId = extractGuid(l["7"]);
        if (!supplierId && lineSuppId) supplierId = lineSuppId;
        const billId = extractGuid(l["8"]);
        const lineAmt = decodeManagerDecimal(l["18"]);
        totalAmount += lineAmt;
        if (billId && lineAmt > 0) {
          allocations.push({ invoiceId: billId, amount: lineAmt });
        }
      }
    } else {
      totalAmount = decodeManagerDecimal(d["3"]);
    }

    if (totalAmount <= 0 && d["8"]) {
      totalAmount = decodeManagerDecimal(d["8"]);
    }

    payments.push({
      id: p.Key.toLowerCase(),
      paymentNumber,
      paymentDate,
      accountId,
      supplierId,
      amount: totalAmount,
      description,
      allocations,
    });
  }

  // 17. Inter-Account Transfers
  const bankTransfers: ManagerExtractedData["bankTransfers"] = [];
  const transferRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.INTER_ACCOUNT_TRANSFERS) as Array<{ Key: string; Content: Buffer }>;
  for (const tr of transferRows) {
    const d = decodeProtobuf(tr.Content);
    const transferDate = decodeManagerDate(d["1"]);
    const fromAccountId = extractGuid(d["2"]) || "";
    const toAccountId = extractGuid(d["3"]) || "";
    const amount = decodeManagerDecimal(d["8"]);
    const description = String(d["5"] || "Bank Transfer").trim();

    bankTransfers.push({
      id: tr.Key.toLowerCase(),
      transferDate,
      fromAccountId,
      toAccountId,
      amount,
      description,
    });
  }

  // 18. Employees
  const employees: ManagerExtractedData["employees"] = [];
  const empRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.EMPLOYEES) as Array<{ Key: string; Content: Buffer }>;
  for (const er of empRows) {
    const d = decodeProtobuf(er.Content);
    const name = String(d["1"] || "Employee").trim();
    const address = typeof d["2"] === "string" ? d["2"].trim() : undefined;
    employees.push({
      id: er.Key.toLowerCase(),
      name,
      address,
    });
  }

  // 19. Payslips
  const payslips: ManagerExtractedData["payslips"] = [];
  const slipRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.PAYSLIPS) as Array<{ Key: string; Content: Buffer }>;
  let slipSeq = 1;
  for (const sr of slipRows) {
    const d = decodeProtobuf(sr.Content);
    const date = decodeManagerDate(d["1"]) || new Date().toISOString().slice(0, 10);
    const employeeId = extractGuid(d["2"]) || "";
    const payslipNumber = `PS-${String(slipSeq++).padStart(5, "0")}`;
    const periodDescription = typeof d["11"] === "string" ? d["11"].trim() : (typeof d["12"] === "string" ? d["12"].trim() : undefined);
    const notes = typeof d["12"] === "string" ? d["12"].trim() : undefined;

    let grossAmount = 0;
    if (d["3"]) {
      const items = Array.isArray(d["3"]) ? d["3"] : [d["3"]];
      for (const item of items) {
        grossAmount += decodeManagerDecimal(item["3"]);
      }
    }

    payslips.push({
      id: sr.Key.toLowerCase(),
      payslipNumber,
      employeeId,
      date,
      periodDescription,
      grossAmount,
      deductions: 0,
      netAmount: grossAmount,
      notes,
    });
  }

  // 20. Journal Entries
  const journalEntries: ManagerExtractedData["journalEntries"] = [];
  const jeRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.JOURNAL_ENTRIES) as Array<{ Key: string; Content: Buffer }>;
  let jeSeq = 1;
  for (const jr of jeRows) {
    const d = decodeProtobuf(jr.Content);
    const date = decodeManagerDate(d["1"]) || new Date().toISOString().slice(0, 10);
    const entryNumberFromDoc = typeof d["2"] === "string" ? d["2"].trim() : "";
    const entryNumber = entryNumberFromDoc || `JE-${String(jeSeq++).padStart(4, "0")}`;
    const narration = String(d["3"] || "Journal Entry").trim();

    const lines: ManagerExtractedData["journalEntries"][0]["lines"] = [];
    if (d["14"]) {
      const rawLines = Array.isArray(d["14"]) ? d["14"] : [d["14"]];
      for (const l of rawLines) {
        const accountId = extractGuid(l["1"]) || "";
        const desc = typeof l["12"] === "string" ? l["12"].trim() : "";
        const debit = decodeManagerDecimal(l["13"]) || 0;
        const credit = decodeManagerDecimal(l["14"]) || 0;
        lines.push({ accountId, description: desc, debit, credit });
      }
    }

    journalEntries.push({
      id: jr.Key.toLowerCase(),
      entryNumber,
      date,
      narration,
      lines,
    });
  }

  return {
    business: {
      name: businessName,
      legalName: businessName,
      trn,
      phone,
      email,
      address: addressText,
      city: "Dubai",
      country: "United Arab Emirates",
      currency: "AED",
      financialYearStartMonth: 1,
    },
    accounts,
    bankAccounts,
    customers,
    suppliers,
    inventoryItems,
    fixedAssets,
    projects,
    customFields,
    salesInvoices,
    salesQuotes,
    salesOrders,
    purchaseInvoices,
    receipts,
    payments,
    bankTransfers,
    employees,
    payslips,
    journalEntries,
  };
}
