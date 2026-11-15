import Link from "next/link";
import { Plus } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { DATE_PATTERN } from "@/lib/params";
import { listDeliveryNotes } from "@/modules/inventory/delivery-note-service";
import { DeliveryNoteTable, type DeliveryNoteRow } from "@/modules/inventory/delivery-note-table";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";

export const metadata = { title: "Delivery Notes" };

export default async function DeliveryNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "inventory");
  const sp = await searchParams;
  const from = DATE_PATTERN.test(sp.from ?? "") ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to ?? "") ? sp.to : undefined;

  const rows = listDeliveryNotes(businessId, user.id, { from, to }) as unknown as DeliveryNoteRow[];
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));

  return (
    <div className="page-container">
      <BackLink href={`/b/${businessId}/inventory/items`}>Inventory</BackLink>
      <PageHeader title="Delivery Notes" description="Customer deliveries and moving-average Cost of Sales.">
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/sales/delivery-notes/new`}>
            <Plus className="size-4" /> New Delivery Note
          </Link>
        </Button>
      </PageHeader>
      {rows.length ? (
        <DeliveryNoteTable
          businessId={businessId}
          currency={access.business.currency}
          rows={rows}
          initialFrom={from}
          initialTo={to}
          serverSnapshot={columnSnapshots["delivery-notes"]}
        />
      ) : (
        <EmptyState
          title="No delivery notes yet"
          description="Create a delivery from a posted Sales Invoice or directly."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/sales/delivery-notes/new`}>Create Delivery Note</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
