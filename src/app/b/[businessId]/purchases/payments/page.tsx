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
import {
  buildDateSearchParams,
  DATE_PATTERN,
  parsePageParam,
  parsePageSizeParam,
} from "@/lib/params";
import { listSupplierPaymentsPaginated } from "@/modules/supplier-payments/supplier-payment-service";
import { SupplierPaymentRowActions } from "@/modules/supplier-payments/supplier-payment-row-actions";

export const metadata = { title: "Supplier Payments" };

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
  
  const { rows: payments, ...pagination } = listSupplierPaymentsPaginated(businessId, user.id, {
    from,
    to,
    page,
    pageSize,
  });
  const searchParamsUrl = buildDateSearchParams({ from, to, pageSize });
  const paginationInfo = pagination;

  return (
    <div className="page-container">
      <PageHeader
        title="Supplier Payments"
        description="Posted supplier disbursements and their reversals."
      >
        <DensityToggle businessId={businessId} />
        <Button asChild>
          <Link href={`/b/${businessId}/purchases/payments/new`}>
            <Plus className="size-4" /> Record Payment
          </Link>
        </Button>
      </PageHeader>
      {payments.length || pagination.total > 0 ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter
            pathname={`/b/${businessId}/purchases/payments`}
            searchParams={searchParamsUrl}
            initialFrom={from ?? ""}
            initialTo={to ?? ""}
            fromLabel="Payment from"
            toLabel="Payment to"
          />
          {payments.length ? (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1000px]">
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th>Supplier</th>
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
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <Link
                          href={`/b/${businessId}/purchases/payments/${payment.id}`}
                          className="tabular font-medium text-primary hover:underline"
                        >
                          {payment.payment_number}
                        </Link>
                      </td>
                      <td>{payment.supplier_name}</td>
                      <td>{formatDate(payment.date)}</td>
                      <td>
                        {payment.bank_account_name}
                      </td>
                      <td className="text-muted-foreground">{payment.reference || "—"}</td>
                      <td className="money text-right">
                        {formatMoney(
                          payment.amount_minor,
                          payment.currency_code,
                          payment.currency_minor_unit,
                        )}
                      </td>
                      <td className="money text-right">
                        {formatMoney(payment.base_amount_minor, access.business.currency)}
                      </td>
                      <td>
                        <StatusBadge status={payment.document_status} />
                      </td>
                      <td>
                        <SupplierPaymentRowActions
                          businessId={businessId}
                          paymentId={payment.id}
                          paymentNumber={payment.payment_number}
                          supplierId={payment.supplier_id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center">
              <p className="font-medium">No supplier payments match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different page or clear the date filters.</p>
            </div>
          )}
          <ListPagination
            pathname={`/b/${businessId}/purchases/payments`}
            searchParams={searchParamsUrl}
            info={paginationInfo}
          />
        </div>
      ) : (
        <EmptyState
          title="No supplier payments yet"
          description="Record a payment from a posted Purchase Invoice."
          action={
            <Button asChild>
              <Link href={`/b/${businessId}/purchases/payments/new`}>
                <Plus className="size-4" /> Record Payment
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
