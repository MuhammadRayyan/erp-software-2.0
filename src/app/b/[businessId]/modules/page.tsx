import { notFound } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { getBusinessAccess } from "@/core/permissions/permissions";
import type { ModuleKey } from "@/core/permissions/module-access";
import { getDashboardCounts } from "@/modules/reports/report-service";
import { getHiddenNavPaths } from "@/modules/preferences/nav-customization-service";
import { isNavPathVisible } from "@/components/app-shell/nav-customization";
import { FileText, ShoppingCart, ReceiptText, Truck, FileInput, Package, Banknote, Scale, ContactRound } from "lucide-react";
import Link from "next/link";

export default async function ModulesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessAccess(businessId, user.id);
  if (!access) notFound();

  const counts = getDashboardCounts(businessId, user.id);
  const enabledModules = new Set<ModuleKey>(access.modules);
  const hiddenNavPaths = getHiddenNavPaths(businessId, user.id);

  const rawSections: Array<{
    title: string;
    items: Array<{
      label: string;
      path: string;
      icon: typeof FileText;
      count: number;
      requiredModules: readonly ModuleKey[];
    }>;
  }> = [
    {
      title: "Sales & Receivables",
      items: [
        { label: "Customers", path: "customers", icon: ContactRound, count: counts.customers, requiredModules: ["sales"] },
        { label: "Sales Quotes", path: "sales/quotes", icon: FileText, count: counts.salesQuotes, requiredModules: ["sales"] },
        { label: "Sales Orders", path: "sales/orders", icon: ShoppingCart, count: counts.salesOrders, requiredModules: ["sales"] },
        { label: "Sales Invoices", path: "sales/invoices", icon: ReceiptText, count: counts.salesInvoices, requiredModules: ["sales"] },
        { label: "Credit Notes", path: "sales/credit-notes", icon: ReceiptText, count: counts.salesCreditNotes, requiredModules: ["sales"] },
      ],
    },
    {
      title: "Purchases & Payables",
      items: [
        { label: "Suppliers", path: "suppliers", icon: Truck, count: counts.suppliers, requiredModules: ["purchases"] },
        { label: "Purchase Orders", path: "purchases/orders", icon: ShoppingCart, count: counts.purchaseOrders, requiredModules: ["purchases"] },
        { label: "Purchase Invoices", path: "purchases/invoices", icon: FileInput, count: counts.purchaseInvoices, requiredModules: ["purchases"] },
      ],
    },
    {
      title: "Inventory & Logistics",
      items: [
        { label: "Inventory Items", path: "inventory/items", icon: Package, count: counts.inventoryItems, requiredModules: ["inventory"] },
        { label: "Goods Receipts", path: "purchases/goods-receipts", icon: Package, count: counts.goodsReceipts, requiredModules: ["inventory", "purchases"] },
        { label: "Delivery Notes", path: "sales/delivery-notes", icon: Truck, count: counts.deliveryNotes, requiredModules: ["inventory", "sales"] },
      ],
    },
    {
      title: "Cash & Accounting",
      items: [
        { label: "Bank Accounts", path: "banking/accounts", icon: Banknote, count: counts.bankAccounts, requiredModules: ["banking"] },
        { label: "Receipts", path: "sales/receipts", icon: ReceiptText, count: counts.receipts, requiredModules: ["banking", "sales"] },
        { label: "Supplier Payments", path: "purchases/payments", icon: Banknote, count: counts.payments, requiredModules: ["banking", "purchases"] },
        { label: "Journal Entries", path: "accounting/journal", icon: Scale, count: counts.journals, requiredModules: ["accounting"] },
      ],
    },
  ];

  const sections = rawSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.requiredModules.some((mod) => enabledModules.has(mod)) &&
          isNavPathVisible(`/${item.path}`, hiddenNavPaths),
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Modules Directory</h1>
          <p className="page-description">Quick access and record counts for all functional areas.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {sections.map(section => (
          <section key={section.title} className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col">
            <div className="bg-surface-muted/50 px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
            </div>
            <ul className="divide-y divide-border flex-1">
              {section.items.map(item => (
                <li key={item.label}>
                  <Link 
                    href={`/b/${businessId}/${item.path}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-primary/5 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{item.label}</span>
                    </div>
                    {item.count > 0 ? (
                      <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {item.count}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
