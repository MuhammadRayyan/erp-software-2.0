import os

os.makedirs("src/app/b/[businessId]/sales/quotes/new", exist_ok=True)
with open("src/app/b/[businessId]/sales/quotes/new/page.tsx", "w", encoding="utf-8") as f:
    f.write('''
import { SalesQuoteForm } from "@/modules/sales-quotes/quote-form";

export default function NewQuotePage({ params }: { params: { businessId: string } }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">New Sales Quote</h1>
      <SalesQuoteForm businessId={params.businessId} intent="create" />
    </div>
  );
}
''')

os.makedirs("src/app/b/[businessId]/sales/orders/new", exist_ok=True)
with open("src/app/b/[businessId]/sales/orders/new/page.tsx", "w", encoding="utf-8") as f:
    f.write('''
import { SalesOrderForm } from "@/modules/sales-orders/sales-order-form";

export default function NewOrderPage({ params }: { params: { businessId: string } }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">New Sales Order</h1>
      <SalesOrderForm businessId={params.businessId} intent="create" />
    </div>
  );
}
''')

print("done")
