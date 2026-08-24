import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { ListPagination, type PaginationInfo } from "@/components/list-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { listSupplierPaymentsPaginated } from "@/modules/supplier-payments/supplier-payment-service";

export const metadata = { title: "Supplier Payments" };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parsePageParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

function parsePageSizeParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

export default async function SupplierPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "purchases");
  const sp = await searchParams;
  const from = DATE_PATTERN.test(sp.from ?? "") ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to ?? "") ? sp.to : undefined;
  const page = parsePageParam(sp.page);
  const pageSize = parsePageSizeParam(sp.pageSize);
  // Server-side pagination: `?page=N` loads the Nth slice (default 50 rows),
  // `?pageSize=M` switches row density (25/50/100/200) and resets to page 1.
  // `from`/`to` filter by payment date. The URL is shareable + refresh-safe.
  const { rows: payments, ...pagination } = listSupplierPaymentsPaginated(businessId, user.id, { from, to, page, pageSize });
  const searchParamsUrl = new URLSearchParams();
  if (from) searchParamsUrl.set("from", from);
  if (to) searchParamsUrl.set("to", to);
  if (pageSize !== undefined) searchParamsUrl.set("pageSize", String(pageSize));
  const paginationInfo: PaginationInfo = {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: pagination.total,
    totalPages: pagination.totalPages,
  };
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Supplier Payments</h1>
          <p className="page-description">Posted supplier disbursements and their reversals.</p>
        </div>
        <Button asChild><Link href={`/b/${businessId}/purchases/payments/new`}><Plus className="size-4" /> Record Payment</Link></Button>
      </div>
      {payments.length || pagination.total > 0 ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter pathname={`/b/${businessId}/purchases/payments`} searchParams={searchParamsUrl} initialFrom={from ?? ""} initialTo={to ?? ""} fromLabel="Payment from" toLabel="Payment to" />
          {payments.length ? (
            <table className="data-table min-w-[1000px]">
              <thead><tr><th>Payment</th><th>Supplier</th><th>Date</th><th>Bank / Cash</th><th>Reference</th><th className="text-right!">Amount</th><th className="text-right!">Base Bank</th><th>Status</th></tr></thead>
              <tbody>{payments.map((payment) => (
                <tr key={payment.id}>
                  <td><Link href={`/b/${businessId}/purchases/payments/${payment.id}`} className="tabular font-medium text-primary hover:underline">{payment.payment_number}</Link></td>
                  <td>{payment.supplier_name}</td>
                  <td>{formatDate(payment.date)}</td>
                  <td>{payment.bank_account_code} · {payment.bank_account_name}</td>
                  <td className="text-muted-foreground">{payment.reference || "—"}</td>
                  <td className="money text-right">{formatMoney(payment.amount_minor, payment.currency_code, payment.currency_minor_unit)}</td>
                  <td className="money text-right">{formatMoney(payment.base_amount_minor, access.business.currency)}</td>
                  <td><Badge tone={payment.document_status === "posted" ? "info" : "danger"}>{payment.document_status === "posted" ? "Posted" : "Reversed"}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <div className="p-10 text-center">
              <p className="font-medium">No supplier payments match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different page or clear the date filters.</p>
            </div>
          )}
          <ListPagination pathname={`/b/${businessId}/purchases/payments`} searchParams={searchParamsUrl} info={paginationInfo} />
        </div>
      ) : (
        <EmptyState title="No supplier payments yet" description="Record a payment from a posted Purchase Invoice." action={<Button asChild><Link href={`/b/${businessId}/purchases/payments/new`}><Plus className="size-4" /> Record Payment</Link></Button>} />
      )}
    </div>
  );
}
