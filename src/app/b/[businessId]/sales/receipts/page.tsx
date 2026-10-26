import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { ListPagination } from "@/components/list-pagination";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DensityToggle } from "@/components/density-toggle";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { buildDateSearchParams, DATE_PATTERN, parsePageParam, parsePageSizeParam } from "@/lib/params";
import { listReceiptsPaginated } from "@/modules/receipts/receipt-service";
import { ReceiptRowActions } from "@/modules/receipts/receipt-row-actions";

export const metadata = { title: "Receipts" };

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

  const { rows: receipts, ...pagination } = listReceiptsPaginated(businessId, user.id, { from, to, page, pageSize });
  const searchParamsUrl = buildDateSearchParams({ from, to });
  if (pageSize !== undefined) searchParamsUrl.set("pageSize", String(pageSize));

  return (
    <div className="page-container">
      <PageHeader title="Receipts" description="Posted customer collections and their reversals.">
        <DensityToggle businessId={businessId} />
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/sales/receipts/new`}>
            <Plus className="size-4" /> Record Receipt
          </Link>
        </Button>
      </PageHeader>
      {receipts.length || pagination.total > 0 ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter
            pathname={`/b/${businessId}/sales/receipts`}
            searchParams={searchParamsUrl}
            initialFrom={from ?? ""}
            initialTo={to ?? ""}
            fromLabel="Receipt from"
            toLabel="Receipt to"
          />
          {receipts.length ? (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[900px]">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Bank / Cash</th>
                    <th>Reference</th>
                    <th className="text-right!">Amount</th>
                    <th className="text-right!">Base Bank</th>
                    <th>Status</th>
                    <th className="w-16 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((receipt) => (
                    <tr key={receipt.id}>
                      <td>
                        <Link href={`/b/${businessId}/sales/receipts/${receipt.id}`} className="tabular font-medium text-primary hover:underline">
                          {receipt.receipt_number}
                        </Link>
                      </td>
                      <td>{receipt.customer_name}</td>
                      <td>{formatDate(receipt.date)}</td>
                      <td>{receipt.bank_account_name}</td>
                      <td className="text-muted-foreground">{receipt.reference || "—"}</td>
                      <td className="money text-right">
                        {formatMoney(receipt.amount_minor, receipt.currency_code, receipt.currency_minor_unit)}
                      </td>
                      <td className="money text-right">
                        {formatMoney(receipt.base_amount_minor, access.business.currency)}
                      </td>
                      <td>
                        <StatusBadge status={receipt.document_status} />
                      </td>
                      <td>
                        <ReceiptRowActions
                          businessId={businessId}
                          receiptId={receipt.id}
                          receiptNumber={receipt.receipt_number}
                          customerId={receipt.customer_id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center">
              <p className="font-medium">No receipts match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different page or clear the date filters.</p>
            </div>
          )}
          <ListPagination
            pathname={`/b/${businessId}/sales/receipts`}
            searchParams={searchParamsUrl}
            info={pagination}
          />
        </div>
      ) : (
        <EmptyState
          title="No receipts yet"
          description="Record a customer collection from a posted invoice."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/sales/receipts/new`}>
                <Plus className="size-4" /> Record Receipt
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
