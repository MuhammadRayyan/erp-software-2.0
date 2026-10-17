"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Info,
  ShieldCheck,
  CircleDollarSign,
  GitBranch,
  CheckCircle2,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogRoot,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export interface ModuleGuideData {
  id: string;
  name: string;
  category: "Sales" | "Purchases" | "Inventory" | "Banking" | "Accounting" | "Settings" | "CRM";
  badge: string;
  summary: string;
  steps: { stage: string; action: string; note: string }[];
  stagesAndRules: {
    status: string;
    canEdit: boolean;
    canVoidOrDelete: boolean;
    ruleDetail: string;
  }[];
  moneyFlow: {
    isPosting: boolean;
    summary: string;
    journalLines?: { account: string; type: "DR" | "CR"; description: string }[];
  };
  linkageRules: string[];
  testChecklist: string[];
}

export const MODULE_GUIDES: Record<string, ModuleGuideData> = {
  "sales-quotes": {
    id: "sales-quotes",
    name: "Sales Quotes",
    category: "Sales",
    badge: "Commercial Proposal",
    summary: "Sales quotes represent initial pricing proposals to prospective or existing customers. They are non-posting and carry no general ledger impact.",
    steps: [
      { stage: "1. Create Quote", action: "Draft proposal with itemized prices and VAT.", note: "Can be edited or deleted anytime in draft." },
      { stage: "2. Send to Client", action: "Customer receives PDF quotation via email or download.", note: "Quote enters 'sent' status." },
      { stage: "3. Convert to Order", action: "On approval, convert into a Sales Order (or direct Invoice).", note: "Quote transitions to 'accepted' and links to the order." },
      { stage: "4. Fulfillment & Billing", action: "Downstream Sales Order proceeds to Delivery Note and Sales Invoice.", note: "Quote remains linked for audit trail." },
    ],
    stagesAndRules: [
      { status: "Draft", canEdit: true, canVoidOrDelete: true, ruleDetail: "Full editing and deletion allowed." },
      { status: "Sent / Accepted", canEdit: true, canVoidOrDelete: true, ruleDetail: "Editable until converted or superseded. Can be cloned/revised." },
      { status: "Superseded / Closed", canEdit: false, canVoidOrDelete: false, ruleDetail: "Locked. Cannot edit or modify once closed or revised." },
    ],
    moneyFlow: {
      isPosting: false,
      summary: "Non-posting document. Zero general ledger impact (0 AED debits/credits).",
    },
    linkageRules: [
      "When converted to a Sales Order, the order receives salesQuoteId.",
      "Editing quote revisions does not destroy original historical audit record.",
    ],
    testChecklist: [
      "Verify creating quote with custom lines and VAT rates.",
      "Verify converting quote to order populates all lines, customer, and quoteId.",
      "Confirm closed/superseded quote hides Edit button.",
    ],
  },

  "sales-orders": {
    id: "sales-orders",
    name: "Sales Orders",
    category: "Sales",
    badge: "Customer Commitment",
    summary: "Sales orders record a customer's formal commitment to purchase goods or services. They drive warehouse dispatch (Delivery Notes) and customer billing (Sales Invoices).",
    steps: [
      { stage: "1. Create / Convert", action: "Created from Quote or directly for customer.", note: "Status starts as 'draft' or 'confirmed'." },
      { stage: "2. Dispatch Goods", action: "Generate Delivery Note for warehouse fulfillment.", note: "Delivery Note reduces stock on hand." },
      { stage: "3. Issue Invoice", action: "Generate Sales Invoice from order lines.", note: "Invoice posts accounts receivable and revenue." },
      { stage: "4. Settle & Complete", action: "Record customer receipts against invoice.", note: "Order marks as fulfilled/completed." },
    ],
    stagesAndRules: [
      { status: "Draft", canEdit: true, canVoidOrDelete: true, ruleDetail: "Full line editing, price adjustments, and deletion allowed." },
      { status: "Confirmed", canEdit: true, canVoidOrDelete: true, ruleDetail: "Editing allowed provided no delivery notes or invoices have been linked." },
      { status: "Completed / Cancelled / Superseded", canEdit: false, canVoidOrDelete: false, ruleDetail: "Locked. Action buttons (Edit/Convert) are disabled or hidden." },
    ],
    moneyFlow: {
      isPosting: false,
      summary: "Non-posting commitment. Ledger postings occur when Delivery Note (COGS) or Sales Invoice (AR/Revenue) is posted.",
    },
    linkageRules: [
      "Editing an order must preserve linked salesQuoteId — verify stepper pill stays intact.",
      "Delivery Notes generated from order link sales_order_id.",
      "Invoices generated from order link sales_order_id.",
    ],
    testChecklist: [
      "Create order from quote -> Edit order -> Check that Quote link stepper pill remains.",
      "Verify completed or cancelled orders cannot be edited.",
      "Ensure order cannot be deleted once downstream delivery notes exist.",
    ],
  },

  "sales-invoices": {
    id: "sales-invoices",
    name: "Sales Invoices",
    category: "Sales",
    badge: "Financial Tax Document",
    summary: "Sales Invoices are legally binding tax documents that post revenue, accounts receivable, and VAT output tax into the General Ledger.",
    steps: [
      { stage: "1. Create Invoice", action: "Drafted standalone, or converted from Sales Order/Quote.", note: "Captures items, accounts, VAT tax code, and Emirate." },
      { stage: "2. Post Invoice", action: "Posting generates immutable double-entry journal entry.", note: "DR Accounts Receivable, CR Revenue, CR VAT Output." },
      { stage: "3. Goods Delivery", action: "Create Delivery Note if items need physical dispatch.", note: "Locks invoice from editing." },
      { stage: "4. Payment Settlement", action: "Record Customer Receipt against invoice.", note: "Receipt credits AR and debits Bank/Cash." },
    ],
    stagesAndRules: [
      { status: "Draft", canEdit: true, canVoidOrDelete: true, ruleDetail: "Full editing and deletion allowed. No ledger posting." },
      { status: "Posted (Unpaid)", canEdit: true, canVoidOrDelete: true, ruleDetail: "Editing allowed if no delivery notes linked. Void allowed only if 100% unpaid." },
      { status: "Partially Paid / Paid", canEdit: false, canVoidOrDelete: false, ruleDetail: "Editing locked. Void locked until all receipts/credit notes unallocated." },
      { status: "Void", canEdit: false, canVoidOrDelete: false, ruleDetail: "Permanently inactive. Reversal journal created." },
    ],
    moneyFlow: {
      isPosting: true,
      summary: "Posts balanced double-entry journal entry to the general ledger upon posting.",
      journalLines: [
        { account: "Accounts Receivable (Current Asset)", type: "DR", description: "Gross total amount receivable from customer" },
        { account: "Sales Revenue (Operating Income)", type: "CR", description: "Subtotal net sales revenue excluding tax" },
        { account: "VAT Output Liability (Current Liability)", type: "CR", description: "5% standard rated VAT payable to FTA" },
      ],
    },
    linkageRules: [
      "Editing an invoice preserves salesOrderId and quoteId — stepper pills stay visible.",
      "Delivery Notes linked to this invoice prevent editing lines to safeguard inventory audit.",
      "Balance minor = Total minor - Allocated Receipts - Allocated Credit Notes.",
    ],
    testChecklist: [
      "Create invoice from order -> Edit invoice -> Verify order stepper link remains intact.",
      "Verify 'Edit' button is hidden once delivery notes are attached.",
      "Verify 'Void' button is disabled once receipts are recorded.",
      "Check General Ledger journal entry debit = credit balancing.",
    ],
  },

  "sales-receipts": {
    id: "sales-receipts",
    name: "Customer Receipts",
    category: "Sales",
    badge: "Cash Settlement",
    summary: "Records inward funds received from customers settling one or multiple sales invoices.",
    steps: [
      { stage: "1. Record Receipt", action: "Select customer, payment method, bank account, and amount.", note: "Enter receipt reference or cheque number." },
      { stage: "2. Allocate Invoices", action: "Allocate receipt amount against outstanding invoices.", note: "Reduces invoice balance due." },
      { stage: "3. Ledger Posting", action: "Posts double-entry: DR Bank/Cash, CR Accounts Receivable.", note: "Increases bank balance." },
      { stage: "4. Bank Reconciliation", action: "Match receipt with imported bank statement line.", note: "Completes financial audit loop." },
    ],
    stagesAndRules: [
      { status: "Posted", canEdit: true, canVoidOrDelete: true, ruleDetail: "Can void or unallocate provided transaction is not locked by bank reconciliation." },
      { status: "Void", canEdit: false, canVoidOrDelete: false, ruleDetail: "Reverses journal posting and restores unpaid invoice balance." },
    ],
    moneyFlow: {
      isPosting: true,
      summary: "Transfers asset from Accounts Receivable into Liquid Cash / Bank.",
      journalLines: [
        { account: "Bank Account / Cash on Hand (Asset)", type: "DR", description: "Inflow of cash or wire transfer" },
        { account: "Accounts Receivable (Asset)", type: "CR", description: "Reduction of outstanding customer balance" },
      ],
    },
    linkageRules: [
      "Allocations tie receipt lines directly to invoice IDs.",
      "Invoice balance due updates in real time upon allocation.",
    ],
    testChecklist: [
      "Record receipt allocating exact invoice amount -> Invoice status becomes 'paid'.",
      "Record partial receipt -> Invoice status becomes 'partially_paid'.",
      "Void receipt -> Invoice returns to 'unpaid' balance.",
    ],
  },

  "delivery-notes": {
    id: "delivery-notes",
    name: "Delivery Notes",
    category: "Inventory",
    badge: "Fulfillment & Dispatch",
    summary: "Documents the physical movement of inventory items from warehouse to the customer. Updates stock levels and perpetual inventory journals.",
    steps: [
      { stage: "1. Create Delivery Note", action: "Generated from Sales Order or Sales Invoice.", note: "Specifies item quantities dispatched." },
      { stage: "2. Stock Deduction", action: "Immediately reduces inventory on hand (stock quantity).", note: "Prevents double allocation of stock." },
      { stage: "3. Inventory Accounting", action: "In perpetual mode: DR Cost of Goods Sold, CR Inventory Asset.", note: "Matches expense with revenue period." },
      { stage: "4. Lock Upstream Doc", action: "Upstream invoice/order is locked from structural line editing.", note: "Preserves inventory dispatch audit." },
    ],
    stagesAndRules: [
      { status: "Draft", canEdit: true, canVoidOrDelete: true, ruleDetail: "Editable until dispatch is confirmed." },
      { status: "Posted", canEdit: false, canVoidOrDelete: true, ruleDetail: "Lines locked. Voiding requires stock return restock entry." },
    ],
    moneyFlow: {
      isPosting: true,
      summary: "Perpetual inventory entries record cost of goods sold.",
      journalLines: [
        { account: "Cost of Goods Sold (Expense)", type: "DR", description: "Cost value of dispatched inventory items" },
        { account: "Inventory Asset (Current Asset)", type: "CR", description: "Reduction in warehouse balance sheet stock" },
      ],
    },
    linkageRules: [
      "Delivery notes link to salesInvoiceId or salesOrderId.",
      "Delivered quantities update on the parent invoice line items.",
    ],
    testChecklist: [
      "Create delivery note -> Verify stock quantity on hand decreases.",
      "Verify parent invoice now blocks line editing.",
    ],
  },

  "credit-notes": {
    id: "credit-notes",
    name: "Credit Notes",
    category: "Sales",
    badge: "Receivables Adjustment",
    summary: "Credit notes offset or refund customer billings due to returns, discounts, or billing adjustments.",
    steps: [
      { stage: "1. Issue Credit Note", action: "Specify customer, original invoice reference, and items.", note: "Calculates VAT refund portion." },
      { stage: "2. Post to Ledger", action: "DR Sales Returns (or Revenue), DR VAT Output, CR Accounts Receivable.", note: "Reduces customer debt." },
      { stage: "3. Allocate / Refund", action: "Apply credit note to open invoice or record cash refund.", note: "Settles open balance." },
    ],
    stagesAndRules: [
      { status: "Draft", canEdit: true, canVoidOrDelete: true, ruleDetail: "Editable and deletable." },
      { status: "Posted", canEdit: false, canVoidOrDelete: true, ruleDetail: "Lines locked. Can allocate or void if unallocated." },
    ],
    moneyFlow: {
      isPosting: true,
      summary: "Reverses original sales revenue and output VAT liability.",
      journalLines: [
        { account: "Sales Returns & Allowances (Revenue Contra)", type: "DR", description: "Reversal of sales revenue" },
        { account: "VAT Output Tax (Liability Reversal)", type: "DR", description: "Recovery of VAT previously declared to FTA" },
        { account: "Accounts Receivable (Asset)", type: "CR", description: "Reduction in customer balance" },
      ],
    },
    linkageRules: ["Can be linked directly to an original Sales Invoice ID."],
    testChecklist: ["Allocate credit note to invoice -> Balance due decreases accordingly."],
  },

  "purchases": {
    id: "purchases",
    name: "Purchase Cycle",
    category: "Purchases",
    badge: "Procurement & Payables",
    summary: "Complete procurement workflow from vendor quotation to purchase order, goods receipt, vendor bill, and payment.",
    steps: [
      { stage: "1. Purchase Quote / PO", action: "Issue Purchase Order to supplier.", note: "Non-posting commercial commitment." },
      { stage: "2. Goods Receipt", action: "Warehouse receives items into stock.", note: "Increases stock on hand; DR Inventory, CR GRNI." },
      { stage: "3. Purchase Invoice (Bill)", action: "Enter vendor invoice with VAT tax date.", note: "DR Expense/Inventory, DR Input VAT, CR Accounts Payable." },
      { stage: "4. Supplier Payment", action: "Remit wire transfer or cheque to supplier.", note: "DR Accounts Payable, CR Bank Account." },
    ],
    stagesAndRules: [
      { status: "Draft Bill", canEdit: true, canVoidOrDelete: true, ruleDetail: "Full line editing allowed." },
      { status: "Posted Bill", canEdit: true, canVoidOrDelete: true, ruleDetail: "Editable if no goods receipts linked. Voidable if unpaid." },
      { status: "Paid Bill", canEdit: false, canVoidOrDelete: false, ruleDetail: "Locked from editing and voiding until payment unallocated." },
    ],
    moneyFlow: {
      isPosting: true,
      summary: "Records procurement expense, recoverable VAT, and vendor liabilities.",
      journalLines: [
        { account: "Expense / Inventory Asset", type: "DR", description: "Procured goods or operational expense" },
        { account: "VAT Input Tax Recoverable (Asset)", type: "DR", description: "5% VAT recoverable from FTA tax return" },
        { account: "Accounts Payable (Current Liability)", type: "CR", description: "Total amount owed to supplier" },
      ],
    },
    linkageRules: [
      "Purchase Invoices retain purchaseOrderId on edit.",
      "Purchase Orders retain purchaseQuoteId on edit.",
    ],
    testChecklist: [
      "Edit purchase invoice -> Verify PO link is preserved.",
      "Check vendor statement displays updated balance.",
      "Verify phone validation when adding new supplier.",
    ],
  },

  "banking": {
    id: "banking",
    name: "Banking & Treasury",
    category: "Banking",
    badge: "Treasury Management",
    summary: "Manages business bank accounts, cash registers, electronic statement imports (OFX, CSV), and bank reconciliation matching.",
    steps: [
      { stage: "1. Accounts & Feeds", action: "Set up bank accounts with IBAN and opening balance.", note: "Linked to GL asset accounts." },
      { stage: "2. Import Statement", action: "Upload statement CSV or OFX from online banking.", note: "Parsed into statement lines." },
      { stage: "3. Auto-Match & Reconcile", action: "Match statement lines with customer receipts or supplier payments.", note: "Eliminates timing differences." },
      { stage: "4. Lock Statement", action: "Reconciled statements prevent altering underlying transactions.", note: "Guarantees audit finality." },
    ],
    stagesAndRules: [
      { status: "Unmatched", canEdit: true, canVoidOrDelete: true, ruleDetail: "Receipts and payments can be edited or unallocated." },
      { status: "Reconciled", canEdit: false, canVoidOrDelete: false, ruleDetail: "Locked. Must un-reconcile statement line before modifying transaction." },
    ],
    moneyFlow: {
      isPosting: true,
      summary: "Bank accounts reflect actual cash positions on the Balance Sheet.",
      journalLines: [
        { account: "Bank Account (Current Asset)", type: "DR", description: "Receipts, transfers in, deposits" },
        { account: "Bank Account (Current Asset)", type: "CR", description: "Supplier payments, bank charges, withdrawals" },
      ],
    },
    linkageRules: ["Reconciled transaction ID stored on bank statement line."],
    testChecklist: [
      "Verify bank account balance matches General Ledger account balance.",
      "Perform internal bank transfer -> Check both accounts update symmetrically.",
    ],
  },

  "accounting": {
    id: "accounting",
    name: "General Ledger & Reports",
    category: "Accounting",
    badge: "Double-Entry Core",
    summary: "The financial backbone. Every posted transaction generates immutable debit/credit entries ensuring debits equal credits at all times.",
    steps: [
      { stage: "1. Chart of Accounts", action: "Standard accounts hierarchy: Assets, Liabilities, Equity, Revenue, Expenses.", note: "UAE FTA compliant structure." },
      { stage: "2. Journal Entries", action: "Automatic posting from sales/purchases + manual journal vouchers.", note: "Requires balanced sum(DR) == sum(CR)." },
      { stage: "3. Trial Balance", action: "Aggregates all account balances to verify zero discrepancy.", note: "Difference must always be exactly 0.00." },
      { stage: "4. Financial Statements", action: "Generates Balance Sheet and Profit & Loss (P&L) statements.", note: "Net profit rolls over into Retained Earnings." },
    ],
    stagesAndRules: [
      { status: "Manual Journals", canEdit: true, canVoidOrDelete: true, ruleDetail: "Manual journal drafts can be edited. Posted journals can be reversed." },
      { status: "System Journals", canEdit: false, canVoidOrDelete: false, ruleDetail: "System-generated journals can only be modified by editing or voiding source document." },
    ],
    moneyFlow: {
      isPosting: true,
      summary: "Absolute double-entry invariant: Sum(Debits) === Sum(Credits).",
    },
    linkageRules: ["Each journal entry records source document type and document ID."],
    testChecklist: [
      "Check Trial Balance: Total Debits must equal Total Credits.",
      "Check Balance Sheet: Total Assets must equal Total Liabilities + Total Equity.",
      "Check P&L: Net Income matches Retained Earnings delta.",
    ],
  },

  "customers-suppliers": {
    id: "customers-suppliers",
    name: "Parties (Customers & Suppliers)",
    category: "CRM",
    badge: "Master Data",
    summary: "Master data management for commercial partners. Includes contact information, TRN tax numbers, payment terms, and subledger aging.",
    steps: [
      { stage: "1. Registration", action: "Create contact with validated phone, email, and TRN.", note: "Phone number validates 7-15 digits format." },
      { stage: "2. Transactions", action: "Link customer to quotes/invoices; link supplier to POs/bills.", note: "Builds historical statement of account." },
      { stage: "3. Aging Analysis", action: "Review aged receivables / payables (0-30, 31-60, 61-90, 90+ days).", note: "Aids credit control and cash collection." },
    ],
    stagesAndRules: [
      { status: "Active", canEdit: true, canVoidOrDelete: true, ruleDetail: "Editable anytime. Deletion blocked if historical transactions exist." },
    ],
    moneyFlow: {
      isPosting: false,
      summary: "Subledger balances aggregate directly into GL Accounts Receivable and Accounts Payable.",
    },
    linkageRules: ["Deleting customer or supplier with posted documents is prohibited to preserve integrity."],
    testChecklist: [
      "Attempt entering invalid phone like 'abc' or '123' -> Schema rejects with helpful error.",
      "Enter valid phone (+971 50 123 4567) -> Saves cleanly.",
      "Verify Statement of Account aggregates all posted invoices and receipts.",
    ],
  },

  "templates": {
    id: "templates",
    name: "Document Templates & Settings",
    category: "Settings",
    badge: "PDF Engine",
    summary: "Configures visual branding, company TRN, color themes, and layouts for generated PDF invoices, delivery notes, and purchase orders.",
    steps: [
      { stage: "1. Select Document", action: "Choose document type (Invoice, Quote, Order, Delivery Note).", note: "Applies customized templates per document." },
      { stage: "2. Style & Branding", action: "Pick layout (Modern, Classic, Minimal), color palette, and watermark.", note: "Upload company logo and signature." },
      { stage: "3. Live PDF Preview", action: "Instant preview renders via secure Same-Origin iframe.", note: "X-Frame-Options: SAMEORIGIN allows embedded view." },
      { stage: "4. Save & Deploy", action: "Saved preferences immediately apply to downloaded and emailed PDFs.", note: "Zero restart required." },
    ],
    stagesAndRules: [
      { status: "Active", canEdit: true, canVoidOrDelete: false, ruleDetail: "Template settings can be updated or reset to system defaults anytime." },
    ],
    moneyFlow: {
      isPosting: false,
      summary: "Configuration and presentation only. No financial ledger impact.",
    },
    linkageRules: ["Applies dynamically when rendering PDFs via /api/businesses/.../pdf endpoints."],
    testChecklist: [
      "Navigate to Settings -> Document Templates.",
      "Verify Live PDF Preview renders without 'localhost refused to connect' error.",
      "Toggle between Modern, Classic, and Minimal templates and inspect formatting.",
    ],
  },
};

export function resolveModuleFromPath(pathname: string): ModuleGuideData {
  if (pathname.includes("/sales/invoices")) return MODULE_GUIDES["sales-invoices"];
  if (pathname.includes("/sales/orders")) return MODULE_GUIDES["sales-orders"];
  if (pathname.includes("/sales/quotes")) return MODULE_GUIDES["sales-quotes"];
  if (pathname.includes("/sales/receipts")) return MODULE_GUIDES["sales-receipts"];
  if (pathname.includes("/sales/delivery-notes") || pathname.includes("/inventory/delivery-notes")) return MODULE_GUIDES["delivery-notes"];
  if (pathname.includes("/sales/credit-notes")) return MODULE_GUIDES["credit-notes"];
  if (pathname.includes("/purchases")) return MODULE_GUIDES["purchases"];
  if (pathname.includes("/banking")) return MODULE_GUIDES["banking"];
  if (pathname.includes("/customers") || pathname.includes("/suppliers")) return MODULE_GUIDES["customers-suppliers"];
  if (pathname.includes("/settings/document-templates") || pathname.includes("/settings")) return MODULE_GUIDES["templates"];
  if (pathname.includes("/reports") || pathname.includes("/accounting") || pathname.includes("/tax")) return MODULE_GUIDES["accounting"];
  return MODULE_GUIDES["sales-invoices"];
}

export function ModuleFlowGuide({ currentPath }: { currentPath?: string }) {
  const routerPathname = usePathname();
  const activePath = currentPath || routerPathname || "";
  const initialGuide = useMemo(() => resolveModuleFromPath(activePath), [activePath]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>(initialGuide.id);
  const [open, setOpen] = useState(false);

  const guide = MODULE_GUIDES[selectedModuleId] || initialGuide;

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Testing & Workflow Architecture Guide"
          title="Testing Flow & Architecture Guide: Click to view expected stages, rules, and money flow"
          className="group relative inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 shadow-2xs transition-all hover:border-sky-400 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900/80 cursor-pointer"
        >
          <Info className="size-3.5 text-sky-600 transition-transform group-hover:scale-110 dark:text-sky-400" />
          <span className="hidden sm:inline">Flow & Audit Guide</span>
          <span className="inline-flex size-1.5 rounded-full bg-sky-500 animate-pulse" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-border pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Workflow className="size-4.5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">{guide.name}</DialogTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 font-medium text-foreground">
                    {guide.category}
                  </span>
                  <span>·</span>
                  <span className="font-medium text-primary">{guide.badge}</span>
                  <span>·</span>
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">[Testing & Architecture Mode]</span>
                </div>
              </div>
            </div>

            {/* Quick Switcher across other modules */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Switch Module:</span>
              <select
                value={guide.id}
                onChange={(e) => setSelectedModuleId(e.target.value)}
                className="h-8 rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground shadow-2xs focus:ring-1 focus:ring-primary focus:outline-hidden"
              >
                <option value="sales-quotes">Sales Quotes</option>
                <option value="sales-orders">Sales Orders</option>
                <option value="sales-invoices">Sales Invoices</option>
                <option value="sales-receipts">Customer Receipts</option>
                <option value="delivery-notes">Delivery Notes</option>
                <option value="credit-notes">Credit Notes</option>
                <option value="purchases">Purchase Cycle (PO / Bills)</option>
                <option value="banking">Banking & Treasury</option>
                <option value="customers-suppliers">Customers & Suppliers</option>
                <option value="accounting">General Ledger & Reports</option>
                <option value="templates">Document Templates & Preview</option>
              </select>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {guide.summary}
          </DialogDescription>
        </div>

        {/* Workflow Stepper Flow */}
        <div className="mt-5 space-y-4">
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <GitBranch className="size-3.5 text-primary" />
              Expected End-to-End Workflow Flow
            </h3>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {guide.steps.map((step, idx) => (
                <div
                  key={idx}
                  className="relative flex flex-col justify-between rounded-lg border border-border bg-surface-muted/30 p-3 text-xs"
                >
                  <div>
                    <span className="font-semibold text-foreground">{step.stage}</span>
                    <p className="mt-1 text-muted-foreground text-[11px] leading-snug">{step.action}</p>
                  </div>
                  <span className="mt-2 text-[10px] text-primary/80 font-medium">{step.note}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Allowed Stages & Edit / Void Rules */}
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Allowed Stages, Edit Restrictions & Void Invariants
            </h3>
            <div className="mt-2.5 overflow-hidden rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface-muted/60 text-[11px] font-semibold text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2">Document Status</th>
                    <th className="px-3 py-2">Editable?</th>
                    <th className="px-3 py-2">Voidable / Deletable?</th>
                    <th className="px-3 py-2">System Guard Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {guide.stagesAndRules.map((rule, idx) => (
                    <tr key={idx} className="hover:bg-surface-muted/20">
                      <td className="px-3 py-2 font-medium text-foreground">{rule.status}</td>
                      <td className="px-3 py-2">
                        {rule.canEdit ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="size-3" /> Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                            Locked
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {rule.canVoidOrDelete ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            Allowed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            Hidden / Guarded
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-[11px]">{rule.ruleDetail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Money Flow Architecture & Double-Entry Ledger Impact */}
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <CircleDollarSign className="size-3.5 text-amber-600 dark:text-amber-400" />
              Money Flow Architecture & Double-Entry Postings
            </h3>
            <div className="mt-2.5 rounded-lg border border-border bg-surface-muted/20 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">
                  {guide.moneyFlow.isPosting ? "Direct Ledger Impact (Posting Document)" : "Non-Posting Document"}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${guide.moneyFlow.isPosting ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-neutral-500/10 text-neutral-500"}`}>
                  {guide.moneyFlow.isPosting ? "DR = CR Balanced" : "0 AED GL Impact"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{guide.moneyFlow.summary}</p>

              {guide.moneyFlow.journalLines && guide.moneyFlow.journalLines.length > 0 && (
                <div className="mt-3 overflow-hidden rounded border border-border bg-surface">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border bg-surface-muted/50 text-[10px] uppercase font-semibold text-muted-foreground">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left">Side</th>
                        <th className="px-2.5 py-1.5 text-left">Ledger Account</th>
                        <th className="px-2.5 py-1.5 text-left">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono text-[11px]">
                      {guide.moneyFlow.journalLines.map((jl, idx) => (
                        <tr key={idx}>
                          <td className="px-2.5 py-1.5">
                            <span className={`rounded px-1 py-0.5 font-bold ${jl.type === "DR" ? "bg-sky-500/10 text-sky-600 dark:text-sky-400" : "bg-purple-500/10 text-purple-600 dark:text-purple-400"}`}>
                              {jl.type}
                            </span>
                          </td>
                          <td className="px-2.5 py-1.5 font-medium text-foreground">{jl.account}</td>
                          <td className="px-2.5 py-1.5 text-muted-foreground font-sans text-[11px]">{jl.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Linkage & Testing Checklist */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-3 text-xs">
              <h4 className="flex items-center gap-1.5 font-semibold text-foreground">
                <Workflow className="size-3.5 text-primary" />
                Relational Link Invariants
              </h4>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground text-[11px]">
                {guide.linkageRules.map((rule, idx) => (
                  <li key={idx}>{rule}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-border bg-surface p-3 text-xs">
              <h4 className="flex items-center gap-1.5 font-semibold text-foreground">
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Testing Verification Checklist
              </h4>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground text-[11px]">
                {guide.testChecklist.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <p className="text-[11px] text-muted-foreground">
            Temporary testing aid: Displays real-time expected flows, guards, and GL postings for all modules.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Close Guide
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
