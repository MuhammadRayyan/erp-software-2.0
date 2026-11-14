import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-approvals-")),
  BETTER_AUTH_SECRET: "approvals-test-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { closeAllBusinessConnections, getBusinessDb } = await import("../src/core/db/business");
const { reconcileBusinessDatabase } = await import("../src/core/db/reconciliation");
const { createAndAddBusinessUser, listBusinessUsers, updateMembership } = await import("../src/core/permissions/membership-service");
const { getBusinessAccess } = await import("../src/core/permissions/permissions");
const { saveApprovalRule } = await import("../src/modules/approvals/approval-policy");
const {
  listApprovalRequests,
  approveDocumentRequest,
  rejectDocumentRequest,
  withdrawApprovalRequest,
} = await import("../src/modules/approvals/approval-service");
const {
  listNotificationsForUser,
  getUnreadNotificationCount,
  markNotificationRead,
} = await import("../src/modules/notifications/notification-service");
const { createInvoice, getInvoice, updateInvoice, postInvoice, batchPostInvoices } = await import("../src/modules/sales-invoices/invoice-service");
const { savePurchaseInvoice, getPurchaseInvoice, postPurchaseInvoiceDoc, batchPostPurchaseInvoices } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const { savePurchaseOrder, getPurchaseOrder, issuePurchaseOrder, createPurchaseOrderRevision } = await import("../src/modules/purchase-orders/purchase-order-service");
const {
  createReceipt,
  getReceipt,
  submitOrPostDraftReceipt,
  deleteDraftReceipt,
} = await import("../src/modules/receipts/receipt-service");
const {
  createSupplierPayment,
  getSupplierPayment,
  submitOrPostDraftSupplierPayment,
  deleteDraftSupplierPayment,
} = await import("../src/modules/supplier-payments/supplier-payment-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);

const today = new Date().toISOString().slice(0, 10);
const customer = sqlite.prepare("SELECT id FROM customers WHERE is_active = 1 LIMIT 1").get() as { id: string };
const supplier = sqlite.prepare("SELECT id FROM suppliers WHERE is_active = 1 LIMIT 1").get() as { id: string };
const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' AND is_active = 1 LIMIT 1").get() as { id: string };
const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' AND is_active = 1 LIMIT 1").get() as { id: string };
const bankGlAccount = sqlite.prepare("SELECT ledger_account_id FROM bank_accounts WHERE is_active = 1 LIMIT 1").get() as { ledger_account_id: string };
const salesTax = sqlite.prepare("SELECT id FROM tax_codes WHERE direction IN ('sales', 'both') AND is_active = 1 LIMIT 1").get() as { id: string };
const purchaseTax = sqlite.prepare("SELECT id FROM tax_codes WHERE direction IN ('purchases', 'both') AND is_active = 1 LIMIT 1").get() as { id: string };

test("selectable per-user requiresApproval routes to queue, notifies approvers, notifies maker back on approve/reject, and supports bypass", async () => {
  const maker = await createAndAddBusinessUser(businessId, adminId, {
    name: "Junior Maker",
    email: "maker@example.com",
    role: "standard",
    requiresApproval: true,
    capabilities: {
      sales: ["view", "create", "edit"],
      purchases: ["view", "create", "edit"],
    },
  });

  const checker = await createAndAddBusinessUser(businessId, adminId, {
    name: "Senior Checker",
    email: "checker@example.com",
    role: "standard",
    requiresApproval: false,
    capabilities: {
      sales: ["view", "create", "edit", "post", "approve"],
      purchases: ["view", "create", "edit", "post", "approve"],
    },
  });

  const makerAccess = getBusinessAccess(businessId, maker.userId)!;
  const checkerAccess = getBusinessAccess(businessId, checker.userId)!;
  assert.equal(makerAccess.requiresApproval, true);
  assert.equal(checkerAccess.requiresApproval, false);

  // 1. Maker submits a Sales Invoice -> pending_approval, NO GL journal yet
  const invId = createInvoice(
    businessId,
    maker.userId,
    {
      customerId: customer.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      supplyEmirate: "dubai",
      dueDate: today,
      lines: [
        {
          description: "Maker Submitted Service",
          quantity: "1",
          unitPrice: "1000.00",
          salesAccountId: incomeAccount.id,
          taxCodeId: salesTax.id,
        },
      ],
    },
    "submit_approval",
  );

  const pendingInv = getInvoice(businessId, maker.userId, invId)!;
  assert.equal(pendingInv.invoice.documentStatus, "pending_approval");
  assert.equal(pendingInv.journal, null, "Pending approval invoice must not post GL entries");

  // 2. Verify Checker and Admin received approval_requested notifications
  assert.ok(getUnreadNotificationCount(businessId, checker.userId) >= 1);
  const checkerNotifs = listNotificationsForUser(businessId, checker.userId, { unreadOnly: true });
  const invNotif = checkerNotifs.find((n) => n.entityId === invId && n.type === "approval_requested");
  assert.ok(invNotif, "Checker must receive approval_requested notification");

  const queue = listApprovalRequests(businessId, checker.userId, { status: "pending" });
  const invReq = queue.find((r) => r.entityId === invId)!;
  assert.ok(invReq);
  assert.equal(invReq.canApprove, true);

  // 3. Maker cannot self-approve even if trying directly
  assert.throws(
    () => approveDocumentRequest(businessId, maker.userId, invReq.id),
    /PERMISSION_DENIED/,
  );

  // 4. Checker approves -> invoice posts to GL, AND notification goes back to Maker!
  const approved = approveDocumentRequest(businessId, checker.userId, invReq.id, "Verified contract");
  assert.equal(approved.status, "approved");

  const postedInv = getInvoice(businessId, checker.userId, invId)!;
  assert.equal(postedInv.invoice.documentStatus, "posted");
  assert.ok(postedInv.journal, "Approved invoice must post GL journal");

  const makerNotifsAfterApprove = listNotificationsForUser(businessId, maker.userId, { unreadOnly: true });
  const backToMaker = makerNotifsAfterApprove.find(
    (n) => n.entityId === invId && n.type === "approval_approved",
  );
  assert.ok(backToMaker, "Maker must receive approval_approved notification back");
  markNotificationRead(businessId, maker.userId, backToMaker.id);

  // 5. Maker submits a Receipt for the approved invoice -> pending_approval (balance not reduced yet)
  const receiptRes = createReceipt(businessId, maker.userId, {
    customerId: customer.id,
    bankAccountId: bankGlAccount.ledger_account_id,
    date: today,
    currencyCode: "AED",
    exchangeRateToBase: "1",
    exchangeRateDate: today,
    exchangeRateSource: "Base",
    amount: "500.00",
    allocations: [{ invoiceId: invId, amount: "500.00" }],
  });
  assert.equal(receiptRes.documentStatus, "pending_approval");
  assert.equal(getInvoice(businessId, adminId, invId)!.balanceMinor, postedInv.balanceMinor);

  const recReq = listApprovalRequests(businessId, checker.userId, { status: "pending" }).find(
    (r) => r.entityId === receiptRes.id,
  )!;
  assert.ok(recReq);

  // 6. Checker rejects receipt -> returned to draft, Maker notified with approval_rejected!
  const rejected = rejectDocumentRequest(businessId, checker.userId, recReq.id, "Attach bank transfer advice");
  assert.equal(rejected.status, "rejected");
  assert.equal(String(getReceipt(businessId, adminId, receiptRes.id)!.receipt.document_status), "draft");

  const makerRejectNotif = listNotificationsForUser(businessId, maker.userId, { unreadOnly: true }).find(
    (n) => n.entityId === receiptRes.id && n.type === "approval_rejected",
  );
  assert.ok(makerRejectNotif, "Maker must receive approval_rejected notification back");
  assert.ok(makerRejectNotif.message.includes("Attach bank transfer advice"));

  // 7. Admin toggles Maker permission to "Can proceed without approval" (requiresApproval=false + post)
  const makerMembership = listBusinessUsers(businessId, adminId).find((u) => u.user.id === maker.userId)!;
  updateMembership(
    businessId,
    adminId,
    makerMembership.membership.id,
    "standard",
    {
      sales: ["view", "create", "edit", "post"],
      purchases: ["view", "create", "edit", "approve"],
    },
    false,
  );

  // Verify direct posting works immediately without approval when requiresApproval=false & threshold disabled
  const directInvId = createInvoice(
    businessId,
    maker.userId,
    {
      customerId: customer.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      supplyEmirate: "dubai",
      dueDate: today,
      lines: [
        {
          description: "Direct Bypass Service",
          quantity: "1",
          unitPrice: "500.00",
          salesAccountId: incomeAccount.id,
          taxCodeId: salesTax.id,
        },
      ],
    },
    "post",
  );
  assert.equal(getInvoice(businessId, adminId, directInvId)!.invoice.documentStatus, "posted");
});

test("spend threshold rules enforce approval above threshold even for direct-posting standard users", async () => {
  const buyer = await createAndAddBusinessUser(businessId, adminId, {
    name: "Threshold Buyer",
    email: "buyer-threshold@example.com",
    role: "standard",
    requiresApproval: false,
    capabilities: { purchases: ["view", "create", "edit", "approve"] },
  });

  // Enable 5,000 AED threshold on Purchase Orders
  saveApprovalRule(businessId, adminId, {
    entityType: "purchase_order",
    isEnabled: true,
    thresholdMinor: 500000,
    requireCheckerSeparation: true,
  });

  // Below threshold (1,000 AED) -> issues directly
  const smallPoId = savePurchaseOrder(
    businessId,
    buyer.userId,
    {
      supplierId: supplier.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      date: today,
      lines: [{ description: "Small Supplies", quantity: "1", unitPrice: "1000.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTax.id }],
    },
    "issue",
  );
  assert.equal(getPurchaseOrder(businessId, adminId, smallPoId)!.order.status, "issued");

  // Above threshold (6,000 AED) -> routed to pending_approval
  const bigPoId = savePurchaseOrder(
    businessId,
    buyer.userId,
    {
      supplierId: supplier.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      date: today,
      lines: [{ description: "Heavy Equipment", quantity: "1", unitPrice: "6000.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTax.id }],
    },
    "issue",
  );
  assert.equal(getPurchaseOrder(businessId, adminId, bigPoId)!.order.status, "pending_approval");

  // Buyer can withdraw their own pending request back to draft
  const pendingPoReq = listApprovalRequests(businessId, buyer.userId, { status: "pending" }).find(
    (r) => r.entityId === bigPoId,
  )!;
  assert.ok(pendingPoReq);
  assert.equal(pendingPoReq.canApprove, false, "Checker separation blocks self-approval");
  withdrawApprovalRequest(businessId, buyer.userId, pendingPoReq.id);
  assert.equal(getPurchaseOrder(businessId, adminId, bigPoId)!.order.status, "draft");

  // Admin always proceeds directly even above threshold
  const adminBigPoId = savePurchaseOrder(
    businessId,
    adminId,
    {
      supplierId: supplier.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      date: today,
      lines: [{ description: "Admin Equipment", quantity: "1", unitPrice: "8000.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTax.id }],
    },
    "issue",
  );
  assert.equal(getPurchaseOrder(businessId, adminId, adminBigPoId)!.order.status, "issued");

  // Clean ledger check
  const rec = reconcileBusinessDatabase(sqlite);
  assert.deepEqual(rec, {
    unbalancedJournals: 0,
    invalidPostedPayslips: 0,
    invalidPayslipTotals: 0,
    missingDocumentJournals: 0,
  });
});

test("pending_approval edit/post guards, duplicate-approval protection, purchase_invoice & draft settlement lifecycles", async () => {
  const maker = await createAndAddBusinessUser(businessId, adminId, {
    name: "Settlement Maker",
    email: "settlement-maker@example.com",
    role: "standard",
    requiresApproval: true,
    capabilities: {
      sales: ["view", "create", "edit", "delete"],
      purchases: ["view", "create", "edit", "delete"],
    },
  });

  // 1. Sales invoice pending_approval cannot be edited or directly posted via postInvoice/updateInvoice
  const pendingInvId = createInvoice(
    businessId,
    maker.userId,
    {
      customerId: customer.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      dueDate: today,
      lines: [
        {
          description: "Pending Lock Test",
          quantity: "1",
          unitPrice: "500.00",
          salesAccountId: incomeAccount.id,
          taxCodeId: salesTax.id,
        },
      ],
    },
    "submit_approval",
  );
  assert.equal(getInvoice(businessId, adminId, pendingInvId)!.invoice.documentStatus, "pending_approval");

  assert.throws(
    () =>
      updateInvoice(
        businessId,
        adminId,
        pendingInvId,
        {
          customerId: customer.id,
          currencyCode: "AED",
          exchangeRateToBase: "1",
          exchangeRateDate: today,
          exchangeRateSource: "Base",
          invoiceDate: today,
          taxDate: today,
          dueDate: today,
          lines: [
            {
              description: "Bypass Attempt",
              quantity: "1",
              unitPrice: "500.00",
              salesAccountId: incomeAccount.id,
              taxCodeId: salesTax.id,
            },
          ],
        },
        "post",
      ),
    /pending approval/i,
  );

  assert.throws(() => postInvoice(businessId, adminId, pendingInvId), /pending approval/i);

  const invReq = listApprovalRequests(businessId, adminId, { status: "pending" }).find(
    (r) => r.entityId === pendingInvId,
  )!;
  approveDocumentRequest(businessId, adminId, invReq.id, "Approved");
  assert.equal(getInvoice(businessId, adminId, pendingInvId)!.invoice.documentStatus, "posted");

  // Duplicate approval must fail cleanly
  assert.throws(() => approveDocumentRequest(businessId, adminId, invReq.id, "Duplicate"), /already approved/i);

  // 2. Purchase invoice maker-checker approval flow
  const billId = savePurchaseInvoice(
    businessId,
    maker.userId,
    {
      supplierId: supplier.id,
      supplierInvoiceNumber: `SUP-BILL-${Date.now()}`,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      dueDate: today,
      lines: [
        {
          description: "Audit Fee",
          quantity: "1",
          unitPrice: "1200.00",
          expenseAccountId: expenseAccount.id,
          taxCodeId: purchaseTax.id,
        },
      ],
    },
    "submit_approval",
  );
  assert.equal(getPurchaseInvoice(businessId, adminId, billId)!.invoice.documentStatus, "pending_approval");
  const billReq = listApprovalRequests(businessId, adminId, { status: "pending" }).find(
    (r) => r.entityId === billId,
  )!;
  approveDocumentRequest(businessId, adminId, billReq.id, "Bill approved");
  assert.equal(getPurchaseInvoice(businessId, adminId, billId)!.invoice.documentStatus, "posted");

  // 3. Receipt rejected -> draft -> re-submitted -> approved
  const recCreated = createReceipt(businessId, maker.userId, {
    customerId: customer.id,
    bankAccountId: bankGlAccount.ledger_account_id,
    date: today,
    currencyCode: "AED",
    exchangeRateToBase: "1",
    exchangeRateDate: today,
    exchangeRateSource: "Base",
    amount: "200.00",
    reference: "REC-DRAFT-FLOW",
  });
  assert.equal(recCreated.documentStatus, "pending_approval");

  const recReq1 = listApprovalRequests(businessId, adminId, { status: "pending" }).find(
    (r) => r.entityId === recCreated.id,
  )!;
  rejectDocumentRequest(businessId, adminId, recReq1.id, "Verify bank ref");
  assert.equal(getReceipt(businessId, maker.userId, recCreated.id)!.receipt.document_status, "draft");

  const resubmittedRec = submitOrPostDraftReceipt(businessId, maker.userId, recCreated.id);
  assert.equal(resubmittedRec.documentStatus, "pending_approval");

  const recReq2 = listApprovalRequests(businessId, adminId, { status: "pending" }).find(
    (r) => r.entityId === recCreated.id,
  )!;
  approveDocumentRequest(businessId, adminId, recReq2.id, "Verified");
  assert.equal(getReceipt(businessId, adminId, recCreated.id)!.receipt.document_status, "posted");

  // 4. Draft Receipt & Supplier Payment deletion after rejection
  const recToDelete = createReceipt(businessId, maker.userId, {
    customerId: customer.id,
    bankAccountId: bankGlAccount.ledger_account_id,
    date: today,
    currencyCode: "AED",
    exchangeRateToBase: "1",
    exchangeRateDate: today,
    exchangeRateSource: "Base",
    amount: "75.00",
  });
  const recDelReq = listApprovalRequests(businessId, adminId, { status: "pending" }).find(
    (r) => r.entityId === recToDelete.id,
  )!;
  rejectDocumentRequest(businessId, adminId, recDelReq.id, "Duplicate");
  deleteDraftReceipt(businessId, maker.userId, recToDelete.id);
  assert.equal(getReceipt(businessId, adminId, recToDelete.id), null);

  const payCreated = createSupplierPayment(businessId, maker.userId, {
    supplierId: supplier.id,
    bankAccountId: bankGlAccount.ledger_account_id,
    date: today,
    currencyCode: "AED",
    exchangeRateToBase: "1",
    exchangeRateDate: today,
    exchangeRateSource: "Base",
    amount: "300.00",
  });
  assert.equal(payCreated.documentStatus, "pending_approval");
  const payReq = listApprovalRequests(businessId, adminId, { status: "pending" }).find(
    (r) => r.entityId === payCreated.id,
  )!;
  rejectDocumentRequest(businessId, adminId, payReq.id, "Wrong bank");
  assert.equal(getSupplierPayment(businessId, maker.userId, payCreated.id)!.payment.document_status, "draft");

  // Re-submit supplier payment then approve, plus test deleteDraftSupplierPayment on another draft
  const resubmittedPay = submitOrPostDraftSupplierPayment(businessId, maker.userId, payCreated.id);
  assert.equal(resubmittedPay.documentStatus, "pending_approval");
  const payReq2 = listApprovalRequests(businessId, adminId, { status: "pending" }).find(
    (r) => r.entityId === payCreated.id,
  )!;
  approveDocumentRequest(businessId, adminId, payReq2.id, "Paid");
  assert.equal(getSupplierPayment(businessId, adminId, payCreated.id)!.payment.document_status, "posted");

  const payToDelete = createSupplierPayment(businessId, maker.userId, {
    supplierId: supplier.id,
    bankAccountId: bankGlAccount.ledger_account_id,
    date: today,
    currencyCode: "AED",
    exchangeRateToBase: "1",
    exchangeRateDate: today,
    exchangeRateSource: "Base",
    amount: "50.00",
  });
  const payDelReq = listApprovalRequests(businessId, adminId, { status: "pending" }).find(
    (r) => r.entityId === payToDelete.id,
  )!;
  rejectDocumentRequest(businessId, adminId, payDelReq.id, "Cancel");
  deleteDraftSupplierPayment(businessId, maker.userId, payToDelete.id);
  assert.equal(getSupplierPayment(businessId, adminId, payToDelete.id), null);

  const rec = reconcileBusinessDatabase(sqlite);
  assert.deepEqual(rec, {
    unbalancedJournals: 0,
    invalidPostedPayslips: 0,
    invalidPayslipTotals: 0,
    missingDocumentJournals: 0,
  });
});

test("edit-only users without post/approve can explicitly submit drafts for approval while direct post stays denied", async () => {
  const { getSystemSqlite } = await import("../src/core/db/system");
  getSystemSqlite().prepare("UPDATE user SET max_users = 20 WHERE id = ?").run(adminId);

  const editor = await createAndAddBusinessUser(businessId, adminId, {
    name: "Edit Only User",
    email: "edit-only@example.com",
    role: "standard",
    requiresApproval: false,
    capabilities: {
      sales: ["view", "create", "edit"],
      purchases: ["view", "create", "edit"],
    },
  });

  // 1. Draft sales invoice: default "post" throws PERMISSION_DENIED, explicit "submit_approval" routes to pending_approval
  const draftInvId = createInvoice(
    businessId,
    editor.userId,
    {
      customerId: customer.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      dueDate: today,
      lines: [{ description: "Draft Edit-Only Line", quantity: "1", unitPrice: "250.00", salesAccountId: incomeAccount.id, taxCodeId: salesTax.id }],
    },
    "draft",
  );
  assert.throws(() => postInvoice(businessId, editor.userId, draftInvId), /PERMISSION_DENIED/);
  const invStatus = postInvoice(businessId, editor.userId, draftInvId, "submit_approval");
  assert.equal(invStatus, "pending_approval");
  assert.equal(getInvoice(businessId, adminId, draftInvId)!.invoice.documentStatus, "pending_approval");

  // 2. Draft purchase bill: default "post" throws PERMISSION_DENIED, explicit "submit_approval" routes to pending_approval
  const draftBillId = savePurchaseInvoice(
    businessId,
    editor.userId,
    {
      supplierId: supplier.id,
      supplierInvoiceNumber: `SUP-EDIT-${Date.now()}`,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      dueDate: today,
      lines: [{ description: "Draft Bill Line", quantity: "1", unitPrice: "300.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTax.id }],
    },
    "draft",
  );
  assert.throws(() => postPurchaseInvoiceDoc(businessId, editor.userId, draftBillId), /PERMISSION_DENIED/);
  const billStatus = postPurchaseInvoiceDoc(businessId, editor.userId, draftBillId, "submit_approval");
  assert.equal(billStatus, "pending_approval");

  // 3. Draft PO: default "issue" throws PERMISSION_DENIED, explicit "submit_approval" routes to pending_approval & blocks revision
  const draftPoId = savePurchaseOrder(
    businessId,
    editor.userId,
    {
      supplierId: supplier.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      date: today,
      lines: [{ description: "Draft PO Line", quantity: "1", unitPrice: "400.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTax.id }],
    },
    "draft",
  );
  assert.throws(() => issuePurchaseOrder(businessId, editor.userId, draftPoId), /PERMISSION_DENIED/);
  const poStatus = issuePurchaseOrder(businessId, editor.userId, draftPoId, "submit_approval");
  assert.equal(poStatus, "pending_approval");
  assert.throws(() => createPurchaseOrderRevision(businessId, adminId, draftPoId), /pending approval/i);
});

test("batchPostInvoices & batchPostPurchaseInvoices track postedCount vs pendingApprovalCount accurately", async () => {
  const { getSystemSqlite } = await import("../src/core/db/system");
  getSystemSqlite().prepare("UPDATE user SET max_users = 20 WHERE id = ?").run(adminId);

  const batchMaker = await createAndAddBusinessUser(businessId, adminId, {
    name: "Batch Maker",
    email: "batch-maker@example.com",
    role: "standard",
    requiresApproval: true,
    capabilities: {
      sales: ["view", "create", "edit"],
      purchases: ["view", "create", "edit"],
    },
  });

  const batchThresholdUser = await createAndAddBusinessUser(businessId, adminId, {
    name: "Batch Threshold User",
    email: "batch-threshold@example.com",
    role: "standard",
    requiresApproval: false,
    capabilities: {
      sales: ["view", "create", "edit", "post"],
      purchases: ["view", "create", "edit", "post"],
    },
  });

  // 1. Maker with requiresApproval=true batch-posts draft invoice & bill -> pendingApprovalCount=1, postedCount=0
  const makerInvId = createInvoice(
    businessId,
    batchMaker.userId,
    {
      customerId: customer.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      dueDate: today,
      lines: [{ description: "Batch Maker Inv", quantity: "1", unitPrice: "100.00", salesAccountId: incomeAccount.id, taxCodeId: salesTax.id }],
    },
    "draft",
  );
  const makerInvBatch = batchPostInvoices(businessId, batchMaker.userId, [makerInvId]);
  assert.equal(makerInvBatch.successCount, 1);
  assert.equal(makerInvBatch.postedCount, 0);
  assert.equal(makerInvBatch.pendingApprovalCount, 1);
  assert.equal(getInvoice(businessId, adminId, makerInvId)!.invoice.documentStatus, "pending_approval");

  const makerBillId = savePurchaseInvoice(
    businessId,
    batchMaker.userId,
    {
      supplierId: supplier.id,
      supplierInvoiceNumber: `SUP-BATCH-MAKER-${Date.now()}`,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      dueDate: today,
      lines: [{ description: "Batch Maker Bill", quantity: "1", unitPrice: "100.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTax.id }],
    },
    "draft",
  );
  const makerBillBatch = batchPostPurchaseInvoices(businessId, batchMaker.userId, [makerBillId]);
  assert.equal(makerBillBatch.successCount, 1);
  assert.equal(makerBillBatch.postedCount, 0);
  assert.equal(makerBillBatch.pendingApprovalCount, 1);
  assert.equal(getPurchaseInvoice(businessId, adminId, makerBillId)!.invoice.documentStatus, "pending_approval");

  // 2. Spend threshold enabled for sales_invoice (1,000 AED) and purchase_invoice (1,000 AED)
  saveApprovalRule(businessId, adminId, {
    entityType: "sales_invoice",
    isEnabled: true,
    thresholdMinor: 100000,
    requireCheckerSeparation: true,
  });
  saveApprovalRule(businessId, adminId, {
    entityType: "purchase_invoice",
    isEnabled: true,
    thresholdMinor: 100000,
    requireCheckerSeparation: true,
  });

  const smallInvId = createInvoice(
    businessId,
    batchThresholdUser.userId,
    {
      customerId: customer.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      dueDate: today,
      lines: [{ description: "Small Inv", quantity: "1", unitPrice: "200.00", salesAccountId: incomeAccount.id, taxCodeId: salesTax.id }],
    },
    "draft",
  );
  const largeInvId = createInvoice(
    businessId,
    batchThresholdUser.userId,
    {
      customerId: customer.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      dueDate: today,
      lines: [{ description: "Large Inv", quantity: "1", unitPrice: "2000.00", salesAccountId: incomeAccount.id, taxCodeId: salesTax.id }],
    },
    "draft",
  );
  const mixedInvBatch = batchPostInvoices(businessId, batchThresholdUser.userId, [smallInvId, largeInvId]);
  assert.equal(mixedInvBatch.successCount, 2);
  assert.equal(mixedInvBatch.postedCount, 1);
  assert.equal(mixedInvBatch.pendingApprovalCount, 1);
  assert.equal(getInvoice(businessId, adminId, smallInvId)!.invoice.documentStatus, "posted");
  assert.equal(getInvoice(businessId, adminId, largeInvId)!.invoice.documentStatus, "pending_approval");

  const smallBillId = savePurchaseInvoice(
    businessId,
    batchThresholdUser.userId,
    {
      supplierId: supplier.id,
      supplierInvoiceNumber: `SUP-SMALL-${Date.now()}`,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      dueDate: today,
      lines: [{ description: "Small Bill", quantity: "1", unitPrice: "200.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTax.id }],
    },
    "draft",
  );
  const largeBillId = savePurchaseInvoice(
    businessId,
    batchThresholdUser.userId,
    {
      supplierId: supplier.id,
      supplierInvoiceNumber: `SUP-LARGE-${Date.now()}`,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      dueDate: today,
      lines: [{ description: "Large Bill", quantity: "1", unitPrice: "2000.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTax.id }],
    },
    "draft",
  );
  const mixedBillBatch = batchPostPurchaseInvoices(businessId, batchThresholdUser.userId, [smallBillId, largeBillId]);
  assert.equal(mixedBillBatch.successCount, 2);
  assert.equal(mixedBillBatch.postedCount, 1);
  assert.equal(mixedBillBatch.pendingApprovalCount, 1);
  assert.equal(getPurchaseInvoice(businessId, adminId, smallBillId)!.invoice.documentStatus, "posted");
  assert.equal(getPurchaseInvoice(businessId, adminId, largeBillId)!.invoice.documentStatus, "pending_approval");

  // 3. Re-posting a pending_approval document reports failedCount=1 with the document number attached
  const pendingInvRetry = batchPostInvoices(businessId, adminId, [largeInvId]);
  assert.equal(pendingInvRetry.failedCount, 1);
  assert.equal(
    pendingInvRetry.errors[0].number,
    getInvoice(businessId, adminId, largeInvId)!.invoice.invoiceNumber,
  );

  const pendingBillRetry = batchPostPurchaseInvoices(businessId, adminId, [largeBillId]);
  assert.equal(pendingBillRetry.failedCount, 1);
  assert.equal(
    pendingBillRetry.errors[0].number,
    getPurchaseInvoice(businessId, adminId, largeBillId)!.invoice.internalNumber,
  );
});

after(() => {
  closeAllBusinessConnections();
});
