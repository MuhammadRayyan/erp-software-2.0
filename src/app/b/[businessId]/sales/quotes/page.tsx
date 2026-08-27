import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { SalesQuoteTable } from "@/modules/sales-quotes/quote-table";
import { listSalesQuotes } from "@/modules/sales-quotes/quote-service";

export const metadata = { title: "Sales Quotes" };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function QuoteListPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "sales");
  const sp = await searchParams;
  const from = DATE_PATTERN.test(sp.from ?? "") ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to ?? "") ? sp.to : undefined;
  const quotes = listSalesQuotes(businessId, user.id, { from, to });
  const preferences = listPreferences(businessId, user.id);
  const columnSnapshots = decodeColumnSnapshots(preferences);
  const searchParamsUrl = new URLSearchParams();
  if (from) searchParamsUrl.set("from", from);
  if (to) searchParamsUrl.set("to", to);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Quotes</h1>
          <p className="page-description">Draft, send, and track customer quotes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/b/${businessId}/sales/quotes/new`}>
              <Plus className="size-4" /> New Quote
            </Link>
          </Button>
        </div>
      </div>
      {quotes.length ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter
            pathname={`/b/${businessId}/sales/quotes`}
            searchParams={searchParamsUrl}
            initialFrom={from ?? ""}
            initialTo={to ?? ""}
            fromLabel="From"
            toLabel="To"
          />
          <SalesQuoteTable
            businessId={businessId}
            quotes={quotes}
            serverSnapshot={columnSnapshots["sales-quotes"]}
          />
        </div>
      ) : (
        <EmptyState
          icon={<ReceiptText className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No sales quotes yet"
          description="Create your first sales quote for a customer."
          action={
            <Button asChild>
              <Link href={`/b/${businessId}/sales/quotes/new`}>
                <Plus className="size-4" /> New Quote
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
