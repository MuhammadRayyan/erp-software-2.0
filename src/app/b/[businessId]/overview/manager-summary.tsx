import Link from "next/link";
import {
  Banknote,
  BookOpenText,
  Calculator,
  ContactRound,
  FileInput,
  FileText,
  FolderKanban,
  HandCoins,
  ListChecks,
  Package,
  PackageCheck,
  Receipt,
  ReceiptText,
  Scale,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import type { ModuleKey } from "@/core/permissions/permissions";

export type DashboardCounts = {
  customers: number;
  salesQuotes: number;
  salesOrders: number;
  salesInvoices: number;
  salesCreditNotes: number;
  deliveryNotes: number;
  suppliers: number;
  purchaseOrders: number;
  purchaseInvoices: number;
  supplierPayments: number;
  debitNotes: number;
  goodsReceipts: number;
  inventoryItems: number;
  bankAccounts: number;
  receipts: number;
  journals: number;
  chartOfAccounts: number;
  employees: number;
  payslips: number;
  payslipItems?: number;
  projects: number;
  vatPeriods: number;
};

export function ManagerSummary({
  businessId,
  counts,
  allowedModules,
}: {
  businessId: string;
  counts: DashboardCounts;
  allowedModules?: ModuleKey[];
}) {
  const sections = [
    {
      title: "Sales & Customers",
      icon: ContactRound,
      items: [
        { label: "Customers", path: "customers", icon: ContactRound, count: counts.customers, module: "sales" as ModuleKey },
        { label: "Sales Quotes", path: "sales/quotes", icon: FileText, count: counts.salesQuotes, module: "sales" as ModuleKey },
        { label: "Sales Orders", path: "sales/orders", icon: ShoppingCart, count: counts.salesOrders, module: "sales" as ModuleKey },
        { label: "Sales Invoices", path: "sales/invoices", icon: ReceiptText, count: counts.salesInvoices, module: "sales" as ModuleKey },
        { label: "Credit Notes", path: "sales/credit-notes", icon: ReceiptText, count: counts.salesCreditNotes, module: "sales" as ModuleKey },
        { label: "Delivery Notes", path: "sales/delivery-notes", icon: Truck, count: counts.deliveryNotes, module: "inventory" as ModuleKey },
      ],
    },
    {
      title: "Purchases & Suppliers",
      icon: Truck,
      items: [
        { label: "Suppliers", path: "suppliers", icon: Truck, count: counts.suppliers, module: "purchases" as ModuleKey },
        { label: "Purchase Orders", path: "purchases/orders", icon: ShoppingCart, count: counts.purchaseOrders, module: "purchases" as ModuleKey },
        { label: "Purchase Invoices (Bills)", path: "purchases/invoices", icon: FileInput, count: counts.purchaseInvoices, module: "purchases" as ModuleKey },
        { label: "Supplier Payments", path: "purchases/payments", icon: HandCoins, count: counts.supplierPayments, module: "purchases" as ModuleKey },
        { label: "Debit Notes", path: "purchases/debit-notes", icon: ReceiptText, count: counts.debitNotes, module: "purchases" as ModuleKey },
        { label: "Goods Receipts", path: "purchases/goods-receipts", icon: PackageCheck, count: counts.goodsReceipts, module: "inventory" as ModuleKey },
      ],
    },
    {
      title: "Cash & General Ledger",
      icon: Scale,
      items: [
        { label: "Bank Accounts", path: "banking/accounts", icon: Banknote, count: counts.bankAccounts, module: "banking" as ModuleKey },
        { label: "Customer Receipts", path: "sales/receipts", icon: Receipt, count: counts.receipts, module: "sales" as ModuleKey },
        { label: "Journal Entries", path: "accounting/journal", icon: Scale, count: counts.journals, module: "accounting" as ModuleKey },
        { label: "Chart of Accounts", path: "accounting/chart-of-accounts", icon: BookOpenText, count: counts.chartOfAccounts, module: "accounting" as ModuleKey },
      ],
    },
    {
      title: "HR & Payroll",
      icon: Users,
      items: [
        { label: "Employees", path: "payroll/employees", icon: Users, count: counts.employees, module: "payroll" as ModuleKey },
        { label: "Payslips", path: "payroll/payslips", icon: ReceiptText, count: counts.payslips, module: "payroll" as ModuleKey },
        { label: "Payslip Items", path: "payroll/items", icon: ListChecks, count: counts.payslipItems, module: "payroll" as ModuleKey },
        { label: "EOSB Calculator", path: "payroll/eosb-calculator", icon: Calculator, count: undefined, module: "payroll" as ModuleKey },
      ],
    },
    {
      title: "Operations, Projects & Tax",
      icon: FolderKanban,
      items: [
        { label: "Inventory Items", path: "inventory/items", icon: Package, count: counts.inventoryItems, module: "inventory" as ModuleKey },
        { label: "Projects", path: "projects", icon: FolderKanban, count: counts.projects, module: "projects" as ModuleKey },
        { label: "VAT Return", path: "tax/vat", icon: Calculator, count: counts.vatPeriods, module: "reports" as ModuleKey },
      ],
    },
  ];

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!allowedModules) return true;
        return !item.module || allowedModules.includes(item.module);
      }),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
        <div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">Operations Matrix</h2>
          <p className="text-xs text-muted-foreground">
            Complete document register and quick navigation across all core ERP business functions.
          </p>
        </div>
        <div className="text-xs text-muted-foreground font-medium">
          Total Modules Tracked: <span className="font-semibold text-foreground">{visibleSections.reduce((acc, s) => acc + s.items.length, 0)}</span>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {visibleSections.map((section) => {
          const sectionTotal = section.items.reduce((sum, item) => sum + (item.count ?? 0), 0);
          return (
            <section
              key={section.title}
              className="flex flex-col rounded-lg border border-border bg-surface shadow-2xs overflow-hidden transition-all hover:border-border-strong hover:shadow-xs"
            >
              <div className="flex items-center justify-between bg-surface-muted/60 px-3.5 py-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <section.icon className="size-4 text-primary" />
                  <h3 className="text-xs font-semibold text-foreground">{section.title}</h3>
                </div>
                {sectionTotal > 0 && (
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {sectionTotal} total
                  </span>
                )}
              </div>

              <ul className="divide-y divide-border/60 flex-1">
                {section.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={`/b/${businessId}/${item.path}`}
                      className="flex items-center justify-between px-3.5 py-2.5 hover:bg-surface-muted/80 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <item.icon className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                        <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {item.label}
                        </span>
                      </div>
                      {typeof item.count === "number" ? (
                        item.count > 0 ? (
                          <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            {item.count}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60 tabular-nums">0</span>
                        )
                      ) : (
                        <span className="text-[11px] text-muted-foreground/60">→</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
