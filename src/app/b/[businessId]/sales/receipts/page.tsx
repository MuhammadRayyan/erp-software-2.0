import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { listReceipts } from "@/modules/receipts/receipt-service";

export const metadata = { title: "Receipts" };

export default async function ReceiptsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "sales");
  const receipts = listReceipts(businessId, user.id);
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Receipts</h1>
          <p className="page-description">Posted customer collections and their reversals.</p>
        </div>
        <Button asChild>
          <Link href={`/b/${businessId}/sales/receipts/new`}>
            <Plus className="size-4" /> Record Receipt
          </Link>
        </Button>
      </div>
      {receipts.length ? (
        <div className="data-panel">
          <table className="data-table min-w-[900px]">
            <thead><tr><th>Receipt</th><th>Customer</th><th>Date</th><th>Bank / Cash</th><th>Reference</th><th className="text-right!">Amount</th><th className="text-right!">Base Bank</th><th>Status</th></tr></thead>
            <tbody>{receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td><Link href={`/b/${businessId}/sales/receipts/${receipt.id}`} className="tabular font-medium text-primary hover:underline">{receipt.receipt_number}</Link></td>
                <td>{receipt.customer_name}</td>
                <td>{formatDate(receipt.date)}</td>
                <td>{receipt.bank_account_code} · {receipt.bank_account_name}</td>
                <td className="text-muted-foreground">{receipt.reference || "—"}</td>
                <td className="money text-right">{formatMoney(receipt.amount_minor, receipt.currency_code, receipt.currency_minor_unit)}</td>
                <td className="money text-right">{formatMoney(receipt.base_amount_minor, access.business.currency)}</td>
                <td><Badge tone={receipt.document_status === "posted" ? "info" : "danger"}>{receipt.document_status === "posted" ? "Posted" : "Reversed"}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface py-12 text-center">
          <h2 className="font-semibold">No Receipts yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Record a customer collection from a posted invoice.</p>
        </div>
      )}
    </div>
  );
}
