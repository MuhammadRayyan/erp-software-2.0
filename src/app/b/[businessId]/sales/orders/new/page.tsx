// @ts-nocheck

import { SalesOrderForm } from "@/modules/sales-orders/sales-order-form";

export default function NewOrderPage({ params }: { params: { businessId: string } }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">New Sales Order</h1>
      <SalesOrderForm businessId={params.businessId} intent="create" />
    </div>
  );
}
