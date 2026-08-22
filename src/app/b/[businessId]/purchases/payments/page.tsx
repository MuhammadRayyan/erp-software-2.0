import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { listAllSupplierPayments } from "@/modules/supplier-payments/supplier-payment-service";

export const metadata = { title: "Supplier Payments" };

export default async function SupplierPaymentsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "purchases");
  const payments = listAllSupplierPayments(businessId, user.id);
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Supplier Payments</h1>
          <p className="page-description">Posted supplier disbursements and their reversals.</p>
        </div>
        <Button asChild><Link href={`/b/${businessId}/purchases/payments/new`}><Plus className="size-4" /> Record Payment</Link></Button>
      </div>
      {payments.length ? (
        <div className="data-panel"><table className="data-table min-w-[1000px]"><thead><tr><th>Payment</th><th>Supplier</th><th>Date</th><th>Bank / Cash</th><th>Reference</th><th className="text-right!">Amount</th><th className="text-right!">Base Bank</th><th>Status</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td><Link href={`/b/${businessId}/purchases/payments/${payment.id}`} className="tabular font-medium text-primary hover:underline">{payment.payment_number}</Link></td><td>{payment.supplier_name}</td><td>{formatDate(payment.date)}</td><td>{payment.bank_account_code} · {payment.bank_account_name}</td><td className="text-muted-foreground">{payment.reference || "—"}</td><td className="money text-right">{formatMoney(payment.amount_minor, payment.currency_code, payment.currency_minor_unit)}</td><td className="money text-right">{formatMoney(payment.base_amount_minor, access.business.currency)}</td><td><Badge tone={payment.document_status === "posted" ? "info" : "danger"}>{payment.document_status === "posted" ? "Posted" : "Reversed"}</Badge></td></tr>)}</tbody></table></div>
      ) : (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface py-12 text-center"><h2 className="font-semibold">No supplier payments yet</h2><p className="mt-1 text-sm text-muted-foreground">Record a payment from a posted Purchase Invoice.</p></div>
      )}
    </div>
  );
}
