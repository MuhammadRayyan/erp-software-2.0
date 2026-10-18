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
    notes?: string;
    lines: Array<{
      itemId?: string;
      description: string;
      quantity: number;
      unitPrice: number;
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
  purchaseInvoices: Array<{
    id: string;
    invoiceNumber: string;
    issueDate: string;
    supplierId: string;
    notes?: string;
    lines: Array<{
      itemId?: string;
      description: string;
      quantity: number;
      unitPrice: number;
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
  }>;
  payments: Array<{
    id: string;
    paymentNumber: string;
    paymentDate: string;
    accountId?: string;
    supplierId?: string;
    amount: number;
    description: string;
  }>;
  bankTransfers: Array<{
    id: string;
    transferDate: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    description: string;
  }>;
}

// Well-known Manager.io ContentType UUIDs
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
  SALES_INVOICES: "a0f6a539-f6a4-4a38-a69a-546a608a1f6d",
  SALES_QUOTES_BOM: "efc4f2cc-acf0-4815-a9a8-13bae00c6167",
  PURCHASE_INVOICES: "866217a4-f841-47de-a4e6-87152405c88d",
  RECEIPTS: "c6b97908-627b-453b-9b62-3e6308a96ace",
  PAYMENTS: "3c2d2934-27a8-4df3-9afd-890ebeb6fb4e",
  INTER_ACCOUNT_TRANSFERS: "dea4f923-c498-4504-b3ef-30be3c33175e",
  CUSTOM_FIELDS_DEF: "411f5975-0376-4ba9-b7ff-5bb2baa6f69f",
  CUSTOM_FIELD_OPTIONS: "cc7fc110-e3e4-4b3b-823d-86c4a4cdabbc",
  EMPLOYEES: "dadb7f95-a5dd-45c0-945d-6ad4ee28776e",
  PAYSLIPS: "1d103fa7-6fc1-4951-811e-972968b842cc",
};

function extractGuid(sub: any): string | null {
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
    customers.push({
      id: c.Key.toLowerCase(),
      name,
      phone: phoneVal,
      address: addrVal,
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

  // 11. Sales Invoices
  const salesInvoices: ManagerExtractedData["salesInvoices"] = [];
  const invRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.SALES_INVOICES) as Array<{ Key: string; Content: Buffer }>;
  let invSeq = 1;
  for (const r of invRows) {
    const d = decodeProtobuf(r.Content);
    const issueDate = decodeManagerDate(d["3"]);
    const customerId = extractGuid(d["4"]) || "";
    const rawLines = Array.isArray(d["15"]) ? d["15"] : (d["15"] ? [d["15"]] : []);
    const lines: ManagerExtractedData["salesInvoices"][0]["lines"] = [];

    for (const l of rawLines) {
      const itemId = extractGuid(l["1"]);
      const item = itemId ? itemMap.get(itemId) : undefined;
      const description = String(l["2"] || item?.name || "Service Line").trim();
      const quantity = decodeManagerDecimal(l["3"]) || 1;
      let unitPrice = decodeManagerDecimal(l["4"]);
      if (unitPrice === 0 && item) {
        unitPrice = item.salesUnitPrice;
      }
      lines.push({
        itemId: itemId || undefined,
        description,
        quantity,
        unitPrice,
      });
    }

    // Extract custom fields (Chassis, Mileage, Plate)
    const customFieldValues: Record<string, string> = {};
    if (d["23"]?.["1"]) {
      const cfArray = Array.isArray(d["23"]["1"]) ? d["23"]["1"] : [d["23"]["1"]];
      for (const cf of cfArray) {
        const fieldGuid = extractGuid(cf["1"]);
        const fieldVal = typeof cf["2"] === "string" ? cf["2"].trim() : "";
        if (fieldGuid && fieldVal) {
          customFieldValues[fieldGuid] = fieldVal;
        }
      }
    }

    const invoiceNumber = `INV-${String(invSeq++).padStart(5, "0")}`;
    salesInvoices.push({
      id: r.Key.toLowerCase(),
      invoiceNumber,
      issueDate,
      customerId,
      lines,
      customFieldValues,
    });
  }

  // 12. Sales Quotes / Job Estimates
  const salesQuotes: ManagerExtractedData["salesQuotes"] = [];
  const quoteRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.SALES_QUOTES_BOM) as Array<{ Key: string; Content: Buffer }>;
  let quoteSeq = 1;
  for (const q of quoteRows) {
    const d = decodeProtobuf(q.Content);
    const title = String(d["1"] || "Quote").trim();
    const rawLines = Array.isArray(d["3"]) ? d["3"] : (d["3"] ? [d["3"]] : []);
    const lines: ManagerExtractedData["salesQuotes"][0]["lines"] = [];

    for (const l of rawLines) {
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

    const customerId = extractGuid(d["2"]) || undefined;
    salesQuotes.push({
      id: q.Key.toLowerCase(),
      quoteNumber: `SQ-${String(quoteSeq++).padStart(5, "0")}`,
      issueDate: new Date().toISOString().slice(0, 10),
      title,
      customerId,
      lines,
    });
  }

  // 13. Purchase Invoices
  const purchaseInvoices: ManagerExtractedData["purchaseInvoices"] = [];
  const billRows = sqliteDb.prepare('SELECT Key, Content FROM "Objects" WHERE ContentType = ?').all(MANAGER_CONTENT_TYPES.PURCHASE_INVOICES) as Array<{ Key: string; Content: Buffer }>;
  let billSeq = 1;
  for (const b of billRows) {
    const d = decodeProtobuf(b.Content);
    const issueDate = decodeManagerDate(d["3"]);
    const supplierId = extractGuid(d["4"]) || "";
    const rawLines = Array.isArray(d["15"]) ? d["15"] : (d["15"] ? [d["15"]] : []);
    const lines: ManagerExtractedData["purchaseInvoices"][0]["lines"] = [];

    for (const l of rawLines) {
      const itemId = extractGuid(l["1"]);
      const item = itemId ? itemMap.get(itemId) : undefined;
      const description = String(l["2"] || item?.name || "Purchase Item").trim();
      const quantity = decodeManagerDecimal(l["3"]) || 1;
      let unitPrice = decodeManagerDecimal(l["4"]);
      if (unitPrice === 0 && item) {
        unitPrice = item.purchaseUnitPrice;
      }
      lines.push({
        itemId: itemId || undefined,
        description,
        quantity,
        unitPrice,
      });
    }

    purchaseInvoices.push({
      id: b.Key.toLowerCase(),
      invoiceNumber: `BILL-${String(billSeq++).padStart(5, "0")}`,
      issueDate,
      supplierId,
      lines,
    });
  }

  // 14. Inter-Account Transfers
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
    purchaseInvoices,
    receipts: [],
    payments: [],
    bankTransfers,
  };
}
