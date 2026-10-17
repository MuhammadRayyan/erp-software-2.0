import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileText, ShoppingCart, ReceiptText, Truck, FileInput } from "lucide-react";
import { requireUser } from "@/core/auth/session";
import { getBusinessForUser } from "@/core/businesses/business-service";
import { BackLink } from "@/components/back-link";

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
    <div className="page-container max-w-4xl space-y-6">
      <BackLink href={`/b/${businessId}/settings`}>Settings</BackLink>
      <div className="page-header">
        <div>
          <h1 className="page-title">Form Defaults</h1>
          <p className="page-description">Configure the exact fields, line toggles, payment terms, and notes that appear when creating new documents.</p>
        </div>
      </div>

      <div className="space-y-6">
        {FORM_GROUPS.map((group) => (
          <div key={group.category} className="rounded-lg border border-border bg-surface-raised shadow-xs overflow-hidden">
            <div className="border-b border-border bg-surface px-4 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.category}</h2>
            </div>
            <ul className="divide-y divide-border">
              {group.forms.map((form) => (
                <li key={form.id}>
                  <Link
                    href={`/b/${businessId}/settings/form-defaults/${form.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-surface-muted/50 transition-colors"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <form.icon className="size-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-foreground">{form.label}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{form.description}</p>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
