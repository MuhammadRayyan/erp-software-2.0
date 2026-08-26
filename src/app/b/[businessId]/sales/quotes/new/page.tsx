// @ts-nocheck

import { SalesQuoteForm } from "@/modules/sales-quotes/quote-form";

export default function NewQuotePage({ params }: { params: { businessId: string } }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">New Sales Quote</h1>
      <SalesQuoteForm businessId={params.businessId} intent="create" />
    </div>
  );
}
