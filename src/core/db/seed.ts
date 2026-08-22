import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth } from "@/core/auth/auth";
import { createBusiness, listBusinessesForUser } from "@/core/businesses/business-service";
import { getBusinessDb } from "@/core/db/business";
import { getAccountingSettings } from "@/modules/accounting/services/accounting-settings-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { createCustomer, listCustomers, updateCustomer } from "@/modules/customers/customer-service";
import { saveDeliveryNote } from "@/modules/inventory/delivery-note-service";
import { saveGoodsReceipt } from "@/modules/inventory/goods-receipt-service";
import { listInventoryItemOptions, saveInventoryItem } from "@/modules/inventory/inventory-item-service";
import { getDefaultInventoryLocation } from "@/modules/inventory/inventory-location-service";
import { createProject, listProjects } from "@/modules/projects/project-service";
import { createReceipt } from "@/modules/receipts/receipt-service";
import { savePurchaseInvoice, listPurchaseInvoices } from "@/modules/purchase-invoices/purchase-invoice-service";
import { savePurchaseOrder, listPurchaseOrders } from "@/modules/purchase-orders/purchase-order-service";
import { saveCreditNote, listCreditNotes } from "@/modules/sales-credit-notes/credit-note-service";
import { createInvoice } from "@/modules/sales-invoices/invoice-service";
import { createSupplierPayment } from "@/modules/supplier-payments/supplier-payment-service";
import { createSupplier, listSuppliers } from "@/modules/suppliers/supplier-service";
import { ensureDefaultDemoBankAccounts, listBankAccounts } from "@/modules/banking/bank-account-service";
import { saveBankTransaction } from "@/modules/banking/bank-transaction-service";
import { createBankTransfer } from "@/modules/banking/bank-transfer-service";
import { importBankStatement } from "@/modules/banking/statement-service";
import { updateTaxSettings } from "@/modules/tax/tax-settings-service";
import { updateEInvoiceSettings } from "@/modules/einvoicing/settings-service";
import { saveExchangeRate } from "@/modules/currency/exchange-rate";
import { memberships, users } from "./system-schema";
import { getSystemDb } from "./system";

const DEMO_PASSWORD = "demo12345";

async function ensureUser(name: string, email: string) {
  const existing = getSystemDb().select().from(users).where(eq(users.email, email)).get();
  if (existing) return existing;
  await auth.api.signUpEmail({ body: { name, email, password: DEMO_PASSWORD } });
  const created = getSystemDb().select().from(users).where(eq(users.email, email)).get();
  if (!created) throw new Error(`Failed to seed ${email}`);
  return created;
}

function ensureCustomer(
  businessId: string,
  userId: string,
  input: { name: string; email: string; phone: string; taxReference: string },
) {
  const existing = listCustomers(businessId, userId).find((customer) => customer.name === input.name);
  if (existing) return existing.id;
  return createCustomer(businessId, userId, input);
}

function findInvoiceByReference(businessId: string, userId: string, reference: string) {
  return getBusinessDb(businessId, userId).sqlite
    .prepare("SELECT id FROM sales_invoices WHERE reference = ? LIMIT 1")
    .get(reference) as { id: string } | undefined;
}

function isoOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function seedDemoData() {
  const admin = await ensureUser("Demo Administrator", "admin@demo.local");
  const standard = await ensureUser("Demo Standard User", "standard@demo.local");

  const business = listBusinessesForUser(admin.id)[0]?.business ?? (() => {
    const created = createBusiness(
      {
        name: "Northstar Technical Services LLC",
        country: "United Arab Emirates",
        currency: "AED",
        financialYearStartMonth: 1,
      },
      admin.id,
    );
    const createdBusiness = listBusinessesForUser(admin.id).find(
      (entry) => entry.business.id === created.id,
    )?.business;
    if (!createdBusiness) throw new Error("Failed to seed demo business");
    return createdBusiness;
  })();

  const membership = getSystemDb()
    .select()
    .from(memberships)
    .where(eq(memberships.businessId, business.id))
    .all()
    .find((entry) => entry.userId === standard.id);
  if (!membership) {
    getSystemDb()
      .insert(memberships)
      .values({
        id: randomUUID(),
        businessId: business.id,
        userId: standard.id,
        role: "standard",
        modulesJson: JSON.stringify(["sales", "projects"]),
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  const emberlineId = ensureCustomer(business.id, admin.id, {
    name: "Emberline Trading LLC",
    email: "accounts@emberline.example",
    phone: "+97145550142",
    taxReference: "100000000000003",
  });
  const abcId = ensureCustomer(business.id, admin.id, {
    name: "ABC Trading LLC",
    email: "finance@abctrading.example",
    phone: "+97145550188",
    taxReference: "100000000000011",
  });
  const duneId = ensureCustomer(business.id, admin.id, {
    name: "Dune Facilities Management",
    email: "payables@dunefm.example",
    phone: "+97125550170",
    taxReference: "100000000000029",
  });
  const deltaId = ensureCustomer(business.id, admin.id, {
    name: "Delta LLC",
    email: "accounts@delta.example",
    phone: "+97145550197",
    taxReference: "100000000000061",
  });

  function ensureProject(name: string, input: Parameters<typeof createProject>[2]) {
    const existing = listProjects(business.id, admin.id).find((project) => project.name === name);
    return existing?.id ?? createProject(business.id, admin.id, input);
  }
  const dubaiProjectId = ensureProject("Dubai Villa Fit-Out", {
    code: "",
    name: "Dubai Villa Fit-Out",
    customerId: abcId,
    status: "active",
    description: "Interior fit-out engagement used to demonstrate linked sales, purchasing, and ledger actuals.",
    startDate: isoOffset(-45),
    targetEndDate: isoOffset(75),
    actualEndDate: "",
    budgetRevenue: "150000.00",
    budgetCost: "90000.00",
    managerName: "Amina Rahman",
  });
  ensureProject("Office Upgrade", {
    code: "",
    name: "Office Upgrade",
    customerId: deltaId,
    status: "completed",
    description: "Completed office refurbishment used as a compact historical Project example.",
    startDate: isoOffset(-150),
    targetEndDate: isoOffset(-45),
    actualEndDate: isoOffset(-42),
    budgetRevenue: "45000.00",
    budgetCost: "32000.00",
    managerName: "Omar Farooq",
  });

  const settings = getAccountingSettings(business.id, admin.id);
  const taxCodes = getActiveTaxCodes(business.id, admin.id);
  const vatSales = taxCodes.find((code) => code.rateBasisPoints === 500 && code.vatCategory === "standard" && ["sales", "both"].includes(code.direction))!;
  const vatPurchases = taxCodes.find((code) => code.rateBasisPoints === 500 && code.vatCategory === "standard" && ["purchases", "both"].includes(code.direction))!;
  const noVat = taxCodes.find((code) => code.vatCategory === "out_of_scope" && code.direction === "both")!;
  const common = { salesAccountId: settings.defaultSalesAccountId };

  function ensureInvoice(
    reference: string,
    customerId: string,
    intent: "draft" | "post",
    dueOffset: number,
    lines: { itemId?: string; description: string; quantity: string; unitPrice: string; taxCodeId: string; projectId?: string }[],
    projectId = "",
  ) {
    const existing = findInvoiceByReference(business.id, admin.id, reference);
    if (existing) return existing.id;
    return createInvoice(
      business.id,
      admin.id,
      {
        customerId,
        projectId,
        invoiceDate: isoOffset(dueOffset < 0 ? dueOffset - 14 : 0),
        dueDate: isoOffset(dueOffset),
        reference,
        lines: lines.map((line) => ({ ...line, ...common })),
      },
      intent,
    );
  }

  const partialInvoiceId = ensureInvoice("DEMO-PARTIAL", emberlineId, "post", 14, [
    { description: "Technical assessment package", quantity: "1", unitPrice: "1000.00", taxCodeId: vatSales.id },
  ]);
  const paidInvoiceId = ensureInvoice("DEMO-PAID", abcId, "post", 7, [
    { description: "Annual support retainer", quantity: "1", unitPrice: "2500.00", taxCodeId: noVat.id },
  ]);
  ensureInvoice("DEMO-OVERDUE", duneId, "post", -30, [
    { description: "Emergency maintenance visit", quantity: "1", unitPrice: "800.00", taxCodeId: vatSales.id },
  ]);
  ensureInvoice("DEMO-DRAFT", abcId, "draft", 21, [
    { description: "Draft preventive maintenance scope", quantity: "2", unitPrice: "600.00", taxCodeId: vatSales.id },
  ]);
  const projectInvoiceId = ensureInvoice("DEMO-PROJECT-SALES", abcId, "post", 21, [
    { description: "Dubai Villa design and fit-out milestone", quantity: "1", unitPrice: "25000.00", taxCodeId: vatSales.id },
  ], dubaiProjectId);

  const context = getBusinessDb(business.id, admin.id);
  updateTaxSettings(business.id, admin.id, {
    vatRegistered: true,
    trn: "135790246801003",
    vatRegistrationEffectiveDate: "2024-01-01",
    vatDeregistrationDate: "",
    defaultSupplyEmirate: "dubai",
  });
  updateEInvoiceSettings(business.id, admin.id, {
    enabled: true,
    legalName: "Northstar Technical Services LLC",
    legalRegistrationIdentifier: "112345678900003",
    addressLine1: "22 Innovation Avenue",
    city: "Dubai",
    countrySubdivision: "DXB",
    countryCode: "AE",
    participantIdentifier: "",
    participantIdentifierScheme: "",
    endpointIdentifier: "1357902468",
    endpointIdentifierScheme: "0235",
    aspProviderKey: "mock",
    aspEnvironment: "mock",
    specificationVersion: "1.0.4",
  });
  updateCustomer(business.id, admin.id, emberlineId, {
    name: "Emberline Trading LLC",
    email: "accounts@emberline.example",
    phone: "+97145550142",
    taxReference: "100000000000003",
    legalName: "Emberline Trading LLC",
    trn: "134567890123003",
    legalRegistrationIdentifier: "112345679000001",
    electronicAddress: "1345678901",
    electronicAddressScheme: "0235",
    addressLine1: "18 Creek Road",
    city: "Dubai",
    countrySubdivision: "DXB",
    countryCode: "AE",
    buyerReference: "EMBER-AP",
  });
  const eInvoiceDemoInvoiceId = ensureInvoice("DEMO-EINVOICE-INVOICE", emberlineId, "post", 14, [
    { description: "PINT-AE implementation services", quantity: "1", unitPrice: "1200.00", taxCodeId: vatSales.id },
  ]);
  const receiptExists = (reference: string) => Boolean(
    context.sqlite.prepare("SELECT 1 FROM receipts WHERE reference = ? LIMIT 1").get(reference),
  );
  if (!receiptExists("DEMO-PARTIAL-RECEIPT")) {
    createReceipt(business.id, admin.id, {
      customerId: emberlineId,
      invoiceId: partialInvoiceId,
      date: isoOffset(0),
      bankAccountId: settings.defaultBankAccountId,
      amount: "400.00",
      reference: "DEMO-PARTIAL-RECEIPT",
      description: "Partial customer payment",
    });
  }
  if (!receiptExists("DEMO-PAID-RECEIPT")) {
    createReceipt(business.id, admin.id, {
      customerId: abcId,
      invoiceId: paidInvoiceId,
      date: isoOffset(0),
      bankAccountId: settings.defaultBankAccountId,
      amount: "2500.00",
      reference: "DEMO-PAID-RECEIPT",
      description: "Payment in full",
    });
  }

  function ensureSupplier(name: string, email: string, phone: string, taxReference: string) {
    const existing = listSuppliers(business.id, admin.id).find((supplier) => supplier.name === name);
    return existing?.id ?? createSupplier(business.id, admin.id, { name, email, phone, taxReference, address: "Dubai, United Arab Emirates", notes: "", isActive: true });
  }
  const atlasId = ensureSupplier("Atlas Industrial Supplies LLC", "accounts@atlas.example", "+971 4 555 0201", "100000000000037");
  const gulfId = ensureSupplier("Gulf Office Solutions", "billing@gulfoffice.example", "+971 4 555 0202", "100000000000045");
  const coastalId = ensureSupplier("Coastal Facility Materials", "finance@coastal.example", "+971 2 555 0203", "100000000000052");
  const updateSupplierIdentity = context.sqlite.prepare(`
    UPDATE suppliers SET legal_name = ?, trn = ?, legal_registration_identifier = ?,
      electronic_address = ?, electronic_address_scheme = ?, registered_address = ?,
      country_code = 'AE', updated_at = ? WHERE id = ?
  `);
  updateSupplierIdentity.run("Atlas Industrial Supplies LLC", "100000000000003", "ATLAS-TL-1001", "1000000000", "0235", "Dubai, United Arab Emirates", new Date().toISOString(), atlasId);
  updateSupplierIdentity.run("Gulf Office Solutions", "100000000000103", "GULF-TL-1002", "1000000001", "0235", "Dubai, United Arab Emirates", new Date().toISOString(), gulfId);
  updateSupplierIdentity.run("Coastal Facility Materials", "100000000000203", "COASTAL-TL-1003", "1000000002", "0235", "Abu Dhabi, United Arab Emirates", new Date().toISOString(), coastalId);

  // Phase 9 demo rates are deliberately labelled as static demo data. They are not live CBUAE rates.
  const fxDate = isoOffset(0);
  saveExchangeRate(business.id, admin.id, {
    currencyCode: "USD", rateDate: fxDate, rateToBase: "3.672500", source: "CBUAE",
    sourceReference: "DEMO ONLY — manually labelled CBUAE rate; not live data",
  });
  saveExchangeRate(business.id, admin.id, {
    currencyCode: "USD", rateDate: fxDate, rateToBase: "3.680000", source: "Manual",
    sourceReference: "DEMO ONLY — settlement rate; not live data",
  });
  saveExchangeRate(business.id, admin.id, {
    currencyCode: "EUR", rateDate: fxDate, rateToBase: "4.010000", source: "Manual",
    sourceReference: "DEMO ONLY — illustrative manual rate",
  });

  const foreignCustomerId = listCustomers(business.id, admin.id).find((customer) => customer.name === "Orion Export Services")?.id
    ?? createCustomer(business.id, admin.id, { name: "Orion Export Services", email: "finance@orion.example", phone: "+15550100", taxReference: "", defaultCurrencyCode: "USD" });
  const foreignSupplierId = listSuppliers(business.id, admin.id).find((supplier) => supplier.name === "Meridian Components Inc.")?.id
    ?? createSupplier(business.id, admin.id, { name: "Meridian Components Inc.", email: "billing@meridian.example", phone: "+15550110", taxReference: "", address: "United States", notes: "Phase 9 foreign-currency demo Supplier", isActive: true, defaultCurrencyCode: "USD" });
  const foreignSalesReference = "DEMO-FX-USD-SALES";
  const foreignSalesInvoice = findInvoiceByReference(business.id, admin.id, foreignSalesReference);
  const foreignSalesInvoiceId = foreignSalesInvoice?.id ?? createInvoice(business.id, admin.id, {
    currencyCode: "USD", exchangeRateToBase: "3.672500", exchangeRateDate: fxDate, exchangeRateSource: "CBUAE",
    customerId: foreignCustomerId, invoiceDate: fxDate, taxDate: fxDate, dueDate: isoOffset(14), reference: foreignSalesReference,
    lines: [{ description: "Phase 9 foreign consulting services", quantity: "1", unitPrice: "1000.00", salesAccountId: settings.defaultSalesAccountId, taxCodeId: vatSales.id }],
  }, "post");
  if (!receiptExists("DEMO-FX-USD-RECEIPT")) createReceipt(business.id, admin.id, {
    currencyCode: "USD", exchangeRateToBase: "3.680000", exchangeRateDate: fxDate, exchangeRateSource: "Manual",
    customerId: foreignCustomerId, invoiceId: foreignSalesInvoiceId, date: fxDate,
    bankAccountId: settings.defaultBankAccountId, amount: "1050.00", reference: "DEMO-FX-USD-RECEIPT",
    description: "Phase 9 full USD settlement at a different rate",
  });
  const foreignPurchaseReference = "DEMO-FX-USD-PURCHASE";
  const existingForeignPurchase = listPurchaseInvoices(business.id, admin.id).find((invoice) => invoice.reference === foreignPurchaseReference);
  const foreignPurchaseInvoiceId = existingForeignPurchase?.id ?? savePurchaseInvoice(business.id, admin.id, {
    currencyCode: "USD", exchangeRateToBase: "3.672500", exchangeRateDate: fxDate, exchangeRateSource: "CBUAE",
    supplierId: foreignSupplierId, supplierInvoiceNumber: "MERIDIAN-USD-1001", invoiceDate: fxDate,
    taxDate: fxDate, dueDate: isoOffset(14), reference: foreignPurchaseReference,
    lines: [{ description: "Phase 9 foreign components expense", quantity: "1", unitPrice: "1000.00", expenseAccountId: settings.defaultPurchaseExpenseAccountId, taxCodeId: vatPurchases.id }],
  }, "post");
  if (!context.sqlite.prepare("SELECT 1 FROM supplier_payments WHERE reference = 'DEMO-FX-USD-PAYMENT' LIMIT 1").get()) createSupplierPayment(business.id, admin.id, {
    currencyCode: "USD", exchangeRateToBase: "3.680000", exchangeRateDate: fxDate, exchangeRateSource: "Manual",
    supplierId: foreignSupplierId, purchaseInvoiceId: foreignPurchaseInvoiceId, date: fxDate,
    bankAccountId: settings.defaultBankAccountId, amount: "1050.00", reference: "DEMO-FX-USD-PAYMENT",
    description: "Phase 9 full USD supplier settlement at a different rate",
  });

  function ensureOrder(reference: string, supplierId: string, intent: "draft" | "issue", description: string, amount: string, projectId = "", itemId = "", quantity = "1") {
    const existing = listPurchaseOrders(business.id, admin.id).find((order) => order.reference === reference);
    if (existing) return existing.id;
    return savePurchaseOrder(business.id, admin.id, { supplierId, projectId, date: isoOffset(-5), expectedDate: isoOffset(5), reference, notes: "Demo purchase order", lines: [{ itemId, description, quantity, unitPrice: amount, expenseAccountId: settings.defaultPurchaseExpenseAccountId, taxCodeId: vatPurchases.id }] }, intent);
  }
  const orderId = ensureOrder("DEMO-PO-ISSUED", atlasId, "issue", "Electrical service materials", "1000.00");
  ensureOrder("DEMO-PO-DRAFT", coastalId, "draft", "Facility consumables", "750.00");
  const projectOrderId = ensureOrder("DEMO-PROJECT-PO", atlasId, "issue", "Dubai Villa electrical and joinery materials", "9000.00", dubaiProjectId);

  function ensurePurchaseInvoice(reference: string, supplierId: string, intent: "draft" | "post", amount: string, taxCodeId: string, purchaseOrderId = "", projectId = "") {
    const existing = listPurchaseInvoices(business.id, admin.id).find((invoice) => invoice.reference === reference);
    if (existing) return existing.id;
    return savePurchaseInvoice(business.id, admin.id, { supplierId, projectId, supplierInvoiceNumber: `SUP-${reference}`, invoiceDate: isoOffset(-3), dueDate: isoOffset(14), reference, purchaseOrderId, lines: [{ description: "General purchase / expense", quantity: "1", unitPrice: amount, expenseAccountId: settings.defaultPurchaseExpenseAccountId, taxCodeId }] }, intent);
  }
  const partialPurchaseId = ensurePurchaseInvoice("DEMO-PI-PARTIAL", atlasId, "post", "1000.00", vatPurchases.id, orderId);
  const paidPurchaseId = ensurePurchaseInvoice("DEMO-PI-PAID", gulfId, "post", "2000.00", noVat.id);
  ensurePurchaseInvoice("DEMO-PI-UNPAID", coastalId, "post", "500.00", vatPurchases.id);
  ensurePurchaseInvoice("DEMO-PI-DRAFT", atlasId, "draft", "300.00", noVat.id);
  ensurePurchaseInvoice("DEMO-PROJECT-PI", atlasId, "post", "6500.00", vatPurchases.id, projectOrderId, dubaiProjectId);

  const paymentExists = (reference: string) => Boolean(context.sqlite.prepare("SELECT 1 FROM supplier_payments WHERE reference = ? LIMIT 1").get(reference));
  if (!paymentExists("DEMO-SUPPLIER-PARTIAL")) createSupplierPayment(business.id, admin.id, { supplierId: atlasId, purchaseInvoiceId: partialPurchaseId, date: isoOffset(0), bankAccountId: settings.defaultBankAccountId, amount: "400.00", reference: "DEMO-SUPPLIER-PARTIAL", description: "Partial supplier payment" });
  if (!paymentExists("DEMO-SUPPLIER-PAID")) createSupplierPayment(business.id, admin.id, { supplierId: gulfId, purchaseInvoiceId: paidPurchaseId, date: isoOffset(0), bankAccountId: settings.defaultBankAccountId, amount: "2000.00", reference: "DEMO-SUPPLIER-PAID", description: "Supplier payment in full" });

  if (!listCreditNotes(business.id, admin.id).some((note) => note.reference === "DEMO-CREDIT")) {
    saveCreditNote(business.id, admin.id, { customerId: emberlineId, sourceInvoiceId: partialInvoiceId, date: isoOffset(0), reference: "DEMO-CREDIT", reason: "Service allowance", lines: [{ description: "Service allowance", quantity: "1", unitPrice: "100.00", salesAccountId: settings.defaultSalesAccountId, taxCodeId: vatSales.id }] }, "post");
  }
  if (!listCreditNotes(business.id, admin.id).some((note) => note.reference === "DEMO-PROJECT-CREDIT")) {
    saveCreditNote(business.id, admin.id, { customerId: abcId, projectId: dubaiProjectId, sourceInvoiceId: projectInvoiceId, date: isoOffset(0), reference: "DEMO-PROJECT-CREDIT", reason: "Project milestone allowance", lines: [{ description: "Project milestone allowance", quantity: "1", unitPrice: "500.00", salesAccountId: settings.defaultSalesAccountId, taxCodeId: vatSales.id }] }, "post");
  }
  if (!listCreditNotes(business.id, admin.id).some((note) => note.reference === "DEMO-EINVOICE-CREDIT")) {
    saveCreditNote(business.id, admin.id, {
      customerId: emberlineId,
      sourceInvoiceId: eInvoiceDemoInvoiceId,
      date: isoOffset(0),
      reference: "DEMO-EINVOICE-CREDIT",
      reason: "Returned service component",
      eInvoiceReasonCode: "DL8.61.1.D",
      lines: [{ description: "Returned service component", quantity: "1", unitPrice: "100.00", salesAccountId: settings.defaultSalesAccountId, taxCodeId: vatSales.id }],
    }, "post");
  }

  function ensureInventoryItem(sku: string, name: string, unitName: string, salesPrice: string, purchasePrice: string) {
    const existing = listInventoryItemOptions(business.id, admin.id).find((item) => item.sku === sku);
    if (existing) return existing.id;
    return saveInventoryItem(business.id, admin.id, {
      sku, name, description: "Compact Phase 4 demo inventory item", unitName,
      salesPrice, purchasePrice, salesAccountId: settings.defaultSalesAccountId,
      inventoryAssetAccountId: settings.defaultInventoryAssetAccountId,
      costOfSalesAccountId: settings.defaultCostOfSalesAccountId, isActive: true,
    });
  }
  const copperId = ensureInventoryItem("COPPER-CABLE", "Copper Cable", "m", "5.00", "3.00");
  const junctionId = ensureInventoryItem("JUNCTION-BOX", "Junction Box", "pcs", "12.00", "7.00");
  const conduitId = ensureInventoryItem("PVC-CONDUIT", "PVC Conduit", "m", "4.00", "2.00");
  const inboundFixtureId = ensureInventoryItem("INBOUND-FIXTURE", "Inbound Matching Fixture", "pcs", "15.00", "8.00");
  const mainLocation = getDefaultInventoryLocation(business.id, admin.id);
  if (!mainLocation) throw new Error("The demo inventory location could not be found.");
  if (!context.sqlite.prepare("SELECT 1 FROM goods_receipts WHERE reference = 'DEMO-INVENTORY-RECEIPT'").get()) {
    saveGoodsReceipt(business.id, admin.id, {
      supplierId: atlasId, purchaseOrderId: "", purchaseInvoiceId: "", date: isoOffset(-10),
      locationId: mainLocation.id, reference: "DEMO-INVENTORY-RECEIPT", projectId: "",
      notes: "Initial Copper Cable demo receipt",
      lines: [{ itemId: copperId, description: "Copper Cable", quantity: "100", unitCost: "3.00", projectId: "", purchaseOrderLineId: "", purchaseInvoiceLineId: "" }],
    }, "post");
  }
  if (!context.sqlite.prepare("SELECT 1 FROM delivery_notes WHERE reference = 'DEMO-INVENTORY-DELIVERY'").get()) {
    saveDeliveryNote(business.id, admin.id, {
      customerId: abcId, salesInvoiceId: "", date: isoOffset(-2), locationId: mainLocation.id,
      reference: "DEMO-INVENTORY-DELIVERY", projectId: dubaiProjectId,
      notes: "Copper Cable delivered to Dubai Villa Project",
      lines: [{ itemId: copperId, description: "Copper Cable", quantity: "20", projectId: "", salesInvoiceLineId: "" }],
    }, "post");
  }
  ensureOrder("DEMO-INVENTORY-PO", atlasId, "issue", "Junction Box", "7.00", "", junctionId, "50");
  const inboundReceiptOrderId = ensureOrder("DEMO-INBOUND-GR-PO", atlasId, "issue", "Inbound Matching Fixture", "8.00", "", inboundFixtureId, "50");
  if (!context.sqlite.prepare("SELECT 1 FROM goods_receipts WHERE reference = 'DEMO-INVENTORY-PO-RECEIPT'").get()) {
    const inventoryOrderLine = context.sqlite.prepare(`
      SELECT id FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY position LIMIT 1
    `).get(inboundReceiptOrderId) as { id: string };
    saveGoodsReceipt(business.id, admin.id, {
      supplierId: atlasId, purchaseOrderId: inboundReceiptOrderId, purchaseInvoiceId: "", date: isoOffset(-4),
      locationId: mainLocation.id, reference: "DEMO-INVENTORY-PO-RECEIPT", projectId: "",
      notes: "Partial receipt used for deterministic inbound eInvoice matching",
      lines: [{ itemId: inboundFixtureId, description: "Inbound Matching Fixture", quantity: "20", unitCost: "8.00", projectId: "", purchaseOrderLineId: inventoryOrderLine.id, purchaseInvoiceLineId: "" }],
    }, "post");
  }
  ensureInvoice("DEMO-INVENTORY-SALES", abcId, "post", 21, [
    { itemId: conduitId, description: "PVC Conduit", quantity: "30", unitPrice: "4.00", taxCodeId: vatSales.id },
  ]);

  const mainBank = ensureDefaultDemoBankAccounts(business.id, admin.id);
  const bankAccounts = listBankAccounts(business.id, admin.id);
  const pettyCash = bankAccounts.find((account) => account.is_cash_account);
  if (mainBank && !context.sqlite.prepare("SELECT 1 FROM bank_transactions WHERE reference = 'DEMO-BANK-EXPENSE'").get()) {
    saveBankTransaction(business.id, admin.id, {
      bankAccountId: mainBank.id, date: isoOffset(-1), type: "money_out",
      reference: "DEMO-BANK-EXPENSE", description: "Office courier and supplies",
      statementLineId: "", lines: [{ accountId: settings.defaultPurchaseExpenseAccountId,
        taxCodeId: noVat.id, projectId: dubaiProjectId, description: "Office courier and supplies", amount: "42.00" }],
    }, "post");
  }
  if (mainBank && pettyCash && !context.sqlite.prepare("SELECT 1 FROM bank_transfers WHERE reference = 'DEMO-BANK-TRANSFER'").get()) {
    createBankTransfer(business.id, admin.id, {
      fromBankAccountId: mainBank.id, toBankAccountId: pettyCash.id, date: isoOffset(0),
      amount: "100.00", reference: "DEMO-BANK-TRANSFER", description: "Petty cash float",
    });
  }
  if (mainBank && !context.sqlite.prepare("SELECT 1 FROM bank_statement_imports WHERE file_name = 'demo-statement.csv'").get()) {
    const csv = [
      "Date,Description,Reference,Amount,External ID",
      `${isoOffset(0)},EMBERLINE TRADING LLC,DEMO-PARTIAL-RECEIPT,400.00,DEMO-STMT-001`,
      `${isoOffset(0)},ATLAS INDUSTRIAL SUPPLIES,DEMO-SUPPLIER-PARTIAL,-400.00,DEMO-STMT-002`,
      `${isoOffset(0)},OFFICE SUPPLIES,STMT-EXPENSE,-105.00,DEMO-STMT-003`,
      `${isoOffset(0)},PETTY CASH FLOAT,DEMO-BANK-TRANSFER,-100.00,DEMO-STMT-004`,
      `${isoOffset(0)},UNIDENTIFIED DEPOSIT,UNMATCHED-001,77.50,DEMO-STMT-005`,
    ].join("\n");
    importBankStatement(business.id, admin.id, mainBank.id, "demo-statement.csv", csv, {
      date: "Date", valueDate: "", description: "Description", reference: "Reference",
      amount: "Amount", debit: "", credit: "", externalId: "External ID",
    });
  }

  return { admin, standard, business };
}
