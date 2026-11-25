import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listDeliveryNotes } from "@/modules/inventory/delivery-note-service";
import { DeliveryNoteTable, type DeliveryNoteRow } from "@/modules/inventory/delivery-note-table";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";

export const metadata = { title: "Delivery Notes" };

export default async function DeliveryNotesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "inventory");

  const rows = listDeliveryNotes(businessId, user.id) as unknown as DeliveryNoteRow[];
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));

  return (
    <div className="page-container">
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
