import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { DATE_PATTERN } from "@/lib/params";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { LiveRefresh } from "@/components/live-refresh";
import { SalesQuoteTable } from "@/modules/sales-quotes/quote-table";
import { listSalesQuotes } from "@/modules/sales-quotes/quote-service";

export const metadata = { title: "Sales Quotes" };
export const dynamic = "force-dynamic";

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

  return (
    <div className="page-container">
      <LiveRefresh />
      <PageHeader title="Sales Quotes" description="Draft, send, and track customer quotes.">
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/sales/quotes/new`}>
            <Plus className="size-4" /> New Quote
          </Link>
        </Button>
      </PageHeader>
      {quotes.length ? (
        <div className="data-panel overflow-hidden">
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
            <Button permission="create" asChild>
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
