import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-multi-cust-")),
  BETTER_AUTH_SECRET: "multi-customer-project-test-key",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");

test("Multi-Customer Projects: Architecture, Joint Ventures, Tenant Billing & Ledger Integrity", async (t) => {
  const seed = await seedDemoData();
  const businessId = seed.business.id;
  const userId = seed.admin.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  const { createCustomer } = await import("../src/modules/customers/customer-service");
  const {
    createProject,
    addProjectCustomer,
    removeProjectCustomer,
    listProjectCustomers,
    listProjects,
    getProject,
    listProjectOptions,
  } = await import("../src/modules/projects/project-service");
  const { getProjectOperationalView, getProjectProfitability } = await import("../src/modules/projects/project-view-service");
  const { createInvoice, getInvoice } = await import("../src/modules/sales-invoices/invoice-service");
  const { createReceipt } = await import("../src/modules/receipts/receipt-service");
  const { getTrialBalance } = await import("../src/modules/reports/report-service");

  const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
  const standardVat = sqlite.prepare("SELECT id FROM tax_codes WHERE vat_category = 'standard' LIMIT 1").get() as { id: string };
  const bankAccount = sqlite.prepare("SELECT id FROM accounts WHERE subtype IN ('bank', 'cash') LIMIT 1").get() as { id: string };

  assert.ok(incomeAccount, "Income account must exist");
  assert.ok(bankAccount, "Bank account must exist");
  assert.ok(standardVat, "Tax code must exist");

  // 1. Create Stakeholder Customers
  const customerAId = createCustomer(businessId, userId, {
    name: "Emaar Properties PJSC",
    email: "billing@emaar.ae",
    phone: "+97143673333",
  });
  const customerBId = createCustomer(businessId, userId, {
    name: "Meraas Development LLC",
    email: "finance@meraas.ae",
    phone: "+97144000000",
  });
  const customerCId = createCustomer(businessId, userId, {
    name: "Apple Store Retail Dubai",
    email: "ap-dubai@apple.com",
    phone: "+97145000000",
  });
  const customerDId = createCustomer(businessId, userId, {
    name: "Unrelated Logistics LLC",
    email: "accounts@unrelated.ae",
    phone: "+97149999999",
  });

  let projectId = "";

  await t.test("1. Create Project with Primary Customer and Add Co-Clients with Roles", () => {
    projectId = createProject(businessId, userId, {
      name: "Dubai Hills Mall & Commercial Boulevard",
      code: "PRJ-DHM-2026",
      customerId: customerAId,
      status: "active",
      description: "Mixed-use mall development with joint venture co-ownership and retail fit-outs",
      startDate: "2026-01-01",
      targetEndDate: "2026-12-31",
      budgetRevenue: "1000000.00",
      budgetCost: "600000.00",
      managerName: "Omar Al-Mansouri",
    });
    assert.ok(projectId, "Project ID should be returned");

    // Add Customer B as Joint Venture Partner (40% split share)
    addProjectCustomer(businessId, userId, projectId, {
      customerId: customerBId,
      role: "joint_venture",
      billingPercentage: "40.00",
      notes: "40% Co-Development Consortium Partner",
      isPrimary: false,
    });

    // Add Customer C as Tenant / Fit-Out client
    addProjectCustomer(businessId, userId, projectId, {
      customerId: customerCId,
      role: "tenant",
      notes: "Anchor Tenant - Unit G-01 Fit-out Scope",
      isPrimary: false,
    });

    const project = getProject(businessId, userId, projectId);
    assert.ok(project);
    assert.equal(project.customerId, customerAId, "Customer A should be the primary customer");
    assert.equal(project.customers.length, 3, "Project should have 3 associated stakeholders");

    const clientA = project.customers.find((c) => c.customerId === customerAId);
    assert.ok(clientA);
    assert.equal(clientA.isPrimary, true);
    assert.equal(clientA.role, "primary_client");

    const clientB = project.customers.find((c) => c.customerId === customerBId);
    assert.ok(clientB);
    assert.equal(clientB.role, "joint_venture");
    assert.equal(clientB.billingPercentage, 40);

    const clientC = project.customers.find((c) => c.customerId === customerCId);
    assert.ok(clientC);
    assert.equal(clientC.role, "tenant");
  });

  await t.test("2. Verify listProjectOptions returns customerIds containing all associated clients", () => {
    const options = listProjectOptions(businessId, userId);
    const opt = options.find((p) => p.id === projectId);
    assert.ok(opt);
    assert.equal(opt.customerId, customerAId);
    assert.equal(opt.customer_id, customerAId);
    assert.ok(opt.customerIds.includes(customerAId), "Must include primary customer");
    assert.ok(opt.customerIds.includes(customerBId), "Must include JV partner");
    assert.ok(opt.customerIds.includes(customerCId), "Must include tenant");
  });

  let invAId = "";
  let invBId = "";
  let invCId = "";

  await t.test("3. Bill Invoices across Multiple Customers on the Same Project", () => {
    // Invoice 1: Primary Customer A (60,000 AED net)
    invAId = createInvoice(
      businessId,
      userId,
      {
        customerId: customerAId,
        projectId,
        invoiceDate: "2026-08-01",
        dueDate: "2026-09-01",
        currencyCode: "AED",
        lines: [{ description: "Phase 1 - Structural Engineering (Emaar 60%)", quantity: "1", unitPrice: "60000", taxCodeId: standardVat.id, salesAccountId: incomeAccount.id }],
      },
      "post",
    );
    assert.ok(invAId, "Primary client invoice must be created successfully");

    // Invoice 2: JV Partner Customer B (40,000 AED net) on SAME project
    invBId = createInvoice(
      businessId,
      userId,
      {
        customerId: customerBId,
        projectId,
        invoiceDate: "2026-08-01",
        dueDate: "2026-09-01",
        currencyCode: "AED",
        lines: [{ description: "Phase 1 - Structural Engineering (Meraas 40%)", quantity: "1", unitPrice: "40000", taxCodeId: standardVat.id, salesAccountId: incomeAccount.id }],
      },
      "post",
    );
    assert.ok(invBId, "JV Partner invoice must be created successfully on the same project!");

    // Invoice 3: Tenant Customer C (10,000 AED net) on SAME project
    invCId = createInvoice(
      businessId,
      userId,
      {
        customerId: customerCId,
        projectId,
        invoiceDate: "2026-08-05",
        dueDate: "2026-09-05",
        currencyCode: "AED",
        lines: [{ description: "Unit G-01 Architectural Fit-Out Approvals", quantity: "1", unitPrice: "10000", taxCodeId: standardVat.id, salesAccountId: incomeAccount.id }],
      },
      "post",
    );
    assert.ok(invCId, "Tenant invoice must be created successfully on the same project!");
  });

  await t.test("4. Attempting to Bill Unrelated Customer D Throws Data Integrity Error", () => {
    assert.throws(
      () => {
        createInvoice(
          businessId,
          userId,
          {
            customerId: customerDId,
            projectId,
            invoiceDate: "2026-08-01",
            dueDate: "2026-09-01",
            currencyCode: "AED",
            lines: [{ description: "Unrelated delivery", quantity: "1", unitPrice: "5000", taxCodeId: standardVat.id, salesAccountId: incomeAccount.id }],
          },
          "post",
        );
      },
      /Selected project belongs to a different customer/,
      "Unrelated customer billing against this project must be strictly forbidden",
    );
  });

  await t.test("5. Record Cash Receipt from Customer A and Verify Per-Customer Project Balances", () => {
    const invA = getInvoice(businessId, userId, invAId);
    assert.ok(invA);
    const grossTotalMinor = invA.invoice.totalMinor; // 60,000 + 5% = 63,000.00 AED

    createReceipt(
      businessId,
      userId,
      {
        customerId: customerAId,
        invoiceId: invAId,
        bankAccountId: bankAccount.id,
        date: "2026-08-10",
        amount: "63000.00",
        currencyCode: "AED",
        reference: "REC-A-001",
      },
    );

    // Verify Project Stakeholders Financial Breakdown
    const stakeholders = listProjectCustomers(businessId, userId, projectId);
    const clientA = stakeholders.find((s) => s.customerId === customerAId);
    assert.ok(clientA);
    assert.equal(clientA.invoicedMinor, 6300000, "Customer A invoiced gross must be 63,000.00 AED");
    assert.equal(clientA.collectedMinor, grossTotalMinor, "Customer A collected gross must be 63,000.00 AED");
    assert.equal(clientA.outstandingMinor, 0, "Customer A outstanding must be 0");

    const clientB = stakeholders.find((s) => s.customerId === customerBId);
    assert.ok(clientB);
    assert.equal(clientB.invoicedMinor, 4200000, "Customer B invoiced gross must be 42,000.00 AED");
    assert.equal(clientB.collectedMinor, 0, "Customer B collected must be 0");
    assert.equal(clientB.outstandingMinor, 4200000, "Customer B outstanding gross must be 42,000.00 AED");

    const clientC = stakeholders.find((s) => s.customerId === customerCId);
    assert.ok(clientC);
    assert.equal(clientC.invoicedMinor, 1050000, "Customer C invoiced gross must be 10,500.00 AED");
    assert.equal(clientC.collectedMinor, 0, "Customer C collected must be 0");
    assert.equal(clientC.outstandingMinor, 1050000, "Customer C outstanding gross must be 10,500.00 AED");
  });

  await t.test("6. Customer Perspective: listProjects filters accurately for co-clients with roles", () => {
    // When Customer B looks at their projects:
    const projectsForB = listProjects(businessId, userId, customerBId);
    assert.equal(projectsForB.length, 1, "Customer B must find the project where they are JV partner");
    assert.equal(projectsForB[0]?.id, projectId);
    assert.equal(projectsForB[0]?.customerRole, "joint_venture");

    // When Customer C looks at their projects:
    const projectsForC = listProjects(businessId, userId, customerCId);
    assert.equal(projectsForC.length, 1, "Customer C must find the project where they are Tenant");
    assert.equal(projectsForC[0]?.id, projectId);
    assert.equal(projectsForC[0]?.customerRole, "tenant");

    // When Unrelated Customer D looks at their projects:
    const projectsForD = listProjects(businessId, userId, customerDId);
    assert.equal(projectsForD.length, 0, "Customer D must have 0 projects");
  });

  await t.test("7. Stakeholder Deletion Guards vs Safe Removal of Unbilled Contacts", () => {
    // Attempt to remove Customer C who already has an invoice:
    assert.throws(
      () => {
        removeProjectCustomer(businessId, userId, projectId, customerCId);
      },
      /Cannot remove customer because transactions have already been billed/,
      "Cannot remove a customer with active billing history on the project",
    );

    // Add a temporary consultant customer with no transactions:
    const consultantId = createCustomer(businessId, userId, {
      name: "Bureau Veritas Consulting",
      email: "uae@bureauveritas.com",
    });
    addProjectCustomer(businessId, userId, projectId, {
      customerId: consultantId,
      role: "consultant",
      notes: "Third party inspection auditor",
      isPrimary: false,
    });

    const beforeRemoval = listProjectCustomers(businessId, userId, projectId);
    assert.equal(beforeRemoval.some((s) => s.customerId === consultantId), true);

    // Now remove consultant:
    removeProjectCustomer(businessId, userId, projectId, consultantId);
    const afterRemoval = listProjectCustomers(businessId, userId, projectId);
    assert.equal(afterRemoval.some((s) => s.customerId === consultantId), false, "Unbilled stakeholder removed cleanly");
  });

  await t.test("8. Project Operational View and Profitability Reports with Multi-Customer Aggregations", () => {
    const operational = getProjectOperationalView(businessId, userId, projectId);
    assert.equal(operational.projectCustomers.length, 3);
    assert.equal(operational.salesInvoices.length, 3);

    // Invoiced net total = 60,000 + 40,000 + 10,000 = 110,000 AED = 11,000,000 minor
    assert.equal(operational.metrics.invoicedMinor, 11000000, "Operational view must aggregate revenue across all co-clients");

    // Profitability report filtering by Customer B:
    const profitabilityForB = getProjectProfitability(businessId, userId, { customerId: customerBId });
    assert.equal(profitabilityForB.length, 1);
    assert.equal(profitabilityForB[0]?.id, projectId);
    assert.equal(profitabilityForB[0]?.revenue_minor, 11000000);

    // Double-entry trial balance equilibrium
    const tb = getTrialBalance(businessId, userId, "2026-12-31");
    assert.equal(tb.debitMinor, tb.creditMinor, "General Ledger must balance perfectly DR == CR");
  });
});
