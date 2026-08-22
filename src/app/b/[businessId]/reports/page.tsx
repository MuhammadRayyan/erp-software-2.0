import Link from "next/link";
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, BookOpenText, ContactRound, FileInput, FolderKanban, Landmark, ListChecks, PackageSearch, Percent, Scale, ScrollText, Truck, UsersRound } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";

const groups = [
  {
    title: "Accounting",
    reports: [
      { title: "General Ledger", description: "Account-by-account journal movement and running balances.", path: "/reports/general-ledger", icon: BookOpenText },
      { title: "Trial Balance", description: "Net debit and credit balances through a selected date.", path: "/reports/trial-balance", icon: Scale },
    ],
  },
  {
    title: "Projects",
    reports: [
      { title: "Project Profitability", description: "Ledger-backed project revenue, cost, gross profit, and margin.", path: "/reports/project-profitability", icon: FolderKanban },
    ],
  },
  {
    title: "Receivables",
    reports: [
      { title: "Customer Statement", description: "Invoice and receipt activity with a running AR balance.", path: "/reports/customer-statement", icon: ContactRound },
      { title: "Accounts Receivable", description: "Outstanding and overdue balances by customer.", path: "/reports/accounts-receivable", icon: UsersRound },
    ],
  },
  {
    title: "Payables",
    reports: [
      { title: "Accounts Payable", description: "Outstanding and overdue balances by supplier.", path: "/reports/accounts-payable", icon: FileInput },
      { title: "Supplier Statement", description: "Purchase invoice and payment activity with a running AP balance.", path: "/reports/supplier-statement", icon: Truck },
    ],
  },
];

const inventoryGroup = {
  title: "Inventory",
  reports: [
    { title: "Stock On Hand", description: "Movement-derived quantity and moving-average value by location.", path: "/reports/stock-on-hand", icon: PackageSearch },
    { title: "Inventory Movement", description: "Receipts, deliveries, adjustments, and running stock quantities.", path: "/reports/inventory-movement", icon: ScrollText },
    { title: "Items to Receive", description: "Outstanding quantities on issued purchase orders.", path: "/reports/items-to-receive", icon: ArrowDownToLine },
    { title: "Items to Deliver", description: "Outstanding quantities on posted sales invoices.", path: "/reports/items-to-deliver", icon: ArrowUpFromLine },
  ],
};

const bankingGroup = {
  title: "Banking",
  reports: [
    { title: "Bank Transactions", description: "GL-linked bank activity with running and reconciliation status.", path: "/reports/bank-transactions", icon: Landmark },
    { title: "Reconciliation Summary", description: "Latest statement, Book Balance, difference, and unmatched activity by account.", path: "/reports/reconciliation-summary", icon: ListChecks },
  ],
};

const taxGroup = {
  title: "Tax",
  reports: [
    { title: "VAT Return", description: "Explicit-period UAE VAT working papers, reconciliation, review, locks, and snapshots.", path: "/tax/vat", icon: Percent },
    { title: "VAT Transaction Detail", description: "Posted tax-detail ledger by date, category, direction, Emirate, source, and party.", path: "/reports/vat-transactions", icon: ScrollText },
  ],
};

export default async function ReportsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { access } = await requireModule(businessId, "reports");
  const visibleGroups = [...groups, taxGroup];
  if (access.modules.includes("banking")) visibleGroups.push(bankingGroup);
  if (access.modules.includes("inventory")) visibleGroups.push(inventoryGroup);
  return (
    <div className="page-container page-medium">
      <div className="page-header"><div><h1 className="page-title">Reports</h1><p className="page-description">Focused receivables, payables, accounting, Project, Banking, Inventory, and UAE VAT working papers.</p></div></div>
      <div className="space-y-6">
        {visibleGroups.map((group) => <section key={group.title}><h2 className="mb-2 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">{group.title}</h2><div className="data-panel divide-y divide-border">{group.reports.map((report) => <Link key={report.path} href={`/b/${businessId}${report.path}`} className="group flex min-h-18 items-center gap-4 px-4 py-3 hover:bg-surface-muted"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground"><report.icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="font-medium">{report.title}</span><span className="mt-0.5 block text-sm text-muted-foreground">{report.description}</span></span><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link>)}</div></section>)}
      </div>
    </div>
  );
}
