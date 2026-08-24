import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { ListPagination, type PaginationInfo } from "@/components/list-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { listReceiptsPaginated } from "@/modules/receipts/receipt-service";

export const metadata = { title: "Receipts" };

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

export default async function ReceiptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "sales");
  const sp = await searchParams;
  const from = DATE_PATTERN.test(sp.from ?? "") ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to ?? "") ? sp.to : undefined;
  const page = parsePageParam(sp.page);
  const pageSize = parsePageSizeParam(sp.pageSize);
  // Server-side pagination: `?page=N` loads the Nth slice (default 50 rows),
  // `?pageSize=M` switches row density (25/50/100/200) and resets to page 1.
  // `from`/`to` filter by receipt date. The URL is shareable + refresh-safe.
  const { rows: receipts, ...pagination } = listReceiptsPaginated(businessId, user.id, { from, to, page, pageSize });
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
          <h1 className="page-title">Receipts</h1>
          <p className="page-description">Posted customer collections and their reversals.</p>
        </div>
        <Button asChild>
          <Link href={`/b/${businessId}/sales/receipts/new`}>
            <Plus className="size-4" /> Record Receipt
          </Link>
        </Button>
      </div>
      {receipts.length || pagination.total > 0 ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter pathname={`/b/${businessId}/sales/receipts`} searchParams={searchParamsUrl} initialFrom={from ?? ""} initialTo={to ?? ""} fromLabel="Receipt from" toLabel="Receipt to" />
          {receipts.length ? (
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
          ) : (
            <div className="p-10 text-center">
              <p className="font-medium">No receipts match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different page or clear the date filters.</p>
            </div>
          )}
          <ListPagination pathname={`/b/${businessId}/sales/receipts`} searchParams={searchParamsUrl} info={paginationInfo} />
        </div>
      ) : (
        <EmptyState title="No receipts yet" description="Record a customer collection from a posted invoice." action={<Button asChild><Link href={`/b/${businessId}/sales/receipts/new`}><Plus className="size-4" /> Record Receipt</Link></Button>} />
      )}
    </div>
  );
}
