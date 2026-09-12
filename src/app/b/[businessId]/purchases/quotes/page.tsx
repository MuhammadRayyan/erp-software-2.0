import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { PurchaseQuoteTable } from "@/modules/purchase-quotes/purchase-quote-table";
import { listPurchaseQuotes } from "@/modules/purchase-quotes/purchase-quote-service";

export const metadata = { title: "Purchase Quotes" };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function PurchaseQuotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "purchases");
  const sp = await searchParams;
  const from = DATE_PATTERN.test(sp.from ?? "") ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to ?? "") ? sp.to : undefined;
  const quotes = listPurchaseQuotes(businessId, user.id, { from, to });
  const preferences = listPreferences(businessId, user.id);
  const columnSnapshots = decodeColumnSnapshots(preferences);
  const searchParamsUrl = new URLSearchParams();
  if (from) searchParamsUrl.set("from", from);
  if (to) searchParamsUrl.set("to", to);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Quotes</h1>
          <p className="page-description">Draft, receive, and track supplier quotes and RFQs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/b/${businessId}/purchases/quotes/new`}>
              <Plus className="size-4" /> New Purchase Quote
            </Link>
          </Button>
        </div>
      </div>
      {quotes.length ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter
            pathname={`/b/${businessId}/purchases/quotes`}
            searchParams={searchParamsUrl}
            initialFrom={from ?? ""}
            initialTo={to ?? ""}
            fromLabel="From"
            toLabel="To"
          />
          <PurchaseQuoteTable
            businessId={businessId}
            quotes={quotes}
            serverSnapshot={columnSnapshots["purchase-quotes"]}
          />
        </div>
      ) : (
        <EmptyState
          icon={<FileText className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No purchase quotes yet"
          description="Create a purchase quote or RFQ without affecting the ledger."
          action={
            <Button asChild>
              <Link href={`/b/${businessId}/purchases/quotes/new`}>
                <Plus className="size-4" /> New Purchase Quote
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
