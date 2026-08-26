import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, FileText, ShoppingCart, ReceiptText, Truck, FileInput } from "lucide-react";
import { requireUser } from "@/core/auth/session";
import { getBusinessForUser } from "@/core/businesses/business-service";

const FORMS = [
  { id: "sales-quote", label: "Sales Quote", description: "Default fields for new sales quotes.", icon: FileText },
  { id: "sales-order", label: "Sales Order", description: "Default fields for new sales orders.", icon: ShoppingCart },
  { id: "sales-invoice", label: "Sales Invoice", description: "Default fields for new sales invoices.", icon: ReceiptText },
  { id: "sales-credit-note", label: "Sales Credit Note", description: "Default fields for new sales credit notes.", icon: ReceiptText },
  { id: "purchase-order", label: "Purchase Order", description: "Default fields for new purchase orders.", icon: ShoppingCart },
  { id: "purchase-invoice", label: "Purchase Invoice", description: "Default fields for new purchase invoices.", icon: FileInput },
];

export default async function FormDefaultsListPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessForUser(businessId, user.id);
  if (!access) notFound();

  return (
    <div className="page-container max-w-4xl">
      <div className="page-header">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/b/${businessId}/settings`} className="hover:text-foreground">Settings</Link>
            <ChevronRight className="size-4" />
            <span className="text-foreground">Form Defaults</span>
          </div>
          <h1 className="page-title">Form Defaults</h1>
          <p className="page-description">Configure the exact fields and layout that appear when creating a new document.</p>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-border bg-surface shadow-sm">
        <ul className="divide-y divide-border">
          {FORMS.map((form) => (
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
                  <p className="mt-1 text-sm text-muted-foreground">{form.description}</p>
                </div>
                <ChevronRight className="size-5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
