import os

filepath = "src/app/b/[businessId]/overview/manager-summary.tsx"

content = """import { FileText, ShoppingCart, ReceiptText, Truck, FileInput, Package, Banknote, Scale, ContactRound } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@/core/format";

export function ManagerSummary({ businessId, counts }: { businessId: string, counts: any }) {
  const sections = [
    {
      title: "Sales & Receivables",
      items: [
        { label: "Customers", path: "customers", icon: ContactRound, count: counts.customers },
        { label: "Sales Quotes", path: "sales/quotes", icon: FileText, count: counts.salesQuotes },
        { label: "Sales Orders", path: "sales/orders", icon: ShoppingCart, count: counts.salesOrders },
        { label: "Sales Invoices", path: "sales/invoices", icon: ReceiptText, count: counts.salesInvoices },
        { label: "Credit Notes", path: "sales/credit-notes", icon: ReceiptText, count: counts.salesCreditNotes },
      ]
    },
    {
      title: "Purchases & Payables",
      items: [
        { label: "Suppliers", path: "suppliers", icon: Truck, count: counts.suppliers },
        { label: "Purchase Orders", path: "purchases/orders", icon: ShoppingCart, count: counts.purchaseOrders },
        { label: "Purchase Invoices", path: "purchases/invoices", icon: FileInput, count: counts.purchaseInvoices },
      ]
    },
    {
      title: "Inventory & Logistics",
      items: [
        { label: "Inventory Items", path: "inventory/items", icon: Package, count: counts.inventoryItems },
        { label: "Goods Receipts", path: "inventory/goods-receipts", icon: Package, count: counts.goodsReceipts },
        { label: "Delivery Notes", path: "inventory/delivery-notes", icon: Truck, count: counts.deliveryNotes },
      ]
    },
    {
      title: "Cash & Accounting",
      items: [
        { label: "Bank Accounts", path: "banking/accounts", icon: Banknote, count: counts.bankAccounts },
        { label: "Receipts", path: "banking/receipts", icon: ReceiptText, count: counts.receipts },
        { label: "Supplier Payments", path: "purchases/payments", icon: Banknote, count: counts.payments },
        { label: "Journal Entries", path: "accounting/journal", icon: Scale, count: counts.journals },
      ]
    }
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 mt-6">
      {sections.map(section => (
        <section key={section.title} className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col">
          <div className="bg-surface-muted/50 px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
          </div>
          <ul className="divide-y divide-border flex-1">
            {section.items.map(item => (
              <li key={item.label}>
                <Link 
                  href={/b//}
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
  );
}
"""

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("done")
