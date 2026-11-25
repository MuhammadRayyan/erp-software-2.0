"use client";

import Link from "next/link";
import { FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionPermission } from "@/components/permissions-provider";

export function InventoryLocationRowActions({
  businessId,
  locationId,
  locationName,
}: {
  businessId: string;
  locationId: string;
  locationName: string;
}) {
  const canEdit = useActionPermission("edit");
  if (!canEdit) return null;
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        permission="edit"
        asChild
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-foreground"
      >
        <Link href={`/b/${businessId}/inventory/locations/${locationId}/edit`} aria-label={`Edit ${locationName}`}>
          <FileEdit className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
