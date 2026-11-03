import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileText, ShoppingCart, ReceiptText, Truck, FileInput } from "lucide-react";
import { requireUser } from "@/core/auth/session";
import { getBusinessForUser } from "@/core/businesses/business-service";
import { SettingsShell } from "@/components/settings-shell";

const FORM_GROUPS = [
  {
    category: "Sales Documents",
    forms: [
      { id: "sales-quote", label: "Sales Quote", description: "Default fields for new customer quotations.", icon: FileText },
      { id: "sales-order", label: "Sales Order", description: "Default fields for new confirmed sales orders.", icon: ShoppingCart },
      { id: "sales-invoice", label: "Sales Invoice", description: "Default fields for new sales invoices and tax billing.", icon: ReceiptText },
      { id: "sales-credit-note", label: "Sales Credit Note", description: "Default fields for new customer credit notes.", icon: ReceiptText },
      { id: "delivery-note", label: "Delivery Note", description: "Default fields for goods dispatch and delivery notes.", icon: Truck },
    ],
  },
  {
    category: "Purchase Documents",
    forms: [
      { id: "purchase-quote", label: "Purchase Quote / RFQ", description: "Default fields for vendor quotes and requests for quotation.", icon: FileText },
      { id: "purchase-order", label: "Purchase Order", description: "Default fields for official vendor purchase orders.", icon: ShoppingCart },
      { id: "purchase-invoice", label: "Purchase Invoice", description: "Default fields for incoming supplier bills and invoices.", icon: FileInput },
      { id: "debit-note", label: "Debit Note", description: "Default fields for supplier debit notes and returns.", icon: ReceiptText },
      { id: "goods-receipt", label: "Goods Receipt", description: "Default fields for incoming goods receipts at the warehouse.", icon: Truck },
    ],
  },
  {
    category: "Inventory & Stock",
    forms: [
      { id: "stock-adjustment", label: "Stock Adjustment", description: "Default fields for write-offs, damages, and inventory counts.", icon: FileText },
    ],
  },
];

export default async function FormDefaultsListPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessForUser(businessId, user.id);
  if (!access) notFound();

  return (
    <SettingsShell
      businessId={businessId}
      title="Form Defaults"
      description="Configure the exact fields, line toggles, payment terms, and notes that appear when creating new documents."
    >
      <div className="space-y-6">
        {FORM_GROUPS.map((group) => (
          <section key={group.category} className="rounded-xl border border-border bg-surface-raised p-4 sm:p-5 shadow-xs space-y-3">
            <div className="border-b border-border/60 pb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.category}</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.forms.map((form) => (
                <Link
                  key={form.id}
                  href={`/b/${businessId}/settings/form-defaults/${form.id}`}
                  className="group relative flex h-11 items-center justify-between rounded-lg border border-border/70 bg-surface px-3 transition-all duration-150 hover:border-primary/50 hover:bg-surface-muted/50 hover:shadow-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <form.icon className="size-3.5" />
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                      {form.label}
                    </span>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:text-primary group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </SettingsShell>
  );
}
