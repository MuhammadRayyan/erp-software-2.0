"use client";

import Link from "next/link";
import {
  MoreHorizontal,
  FileEdit,
  ClipboardPlus,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionPermission } from "@/components/permissions-provider";

export function InventoryItemRowActions({
  businessId,
  itemId,
  itemName,
}: {
  businessId: string;
  itemId: string;
  itemName: string;
}) {
  const canEdit = useActionPermission("edit");
  const canCreate = useActionPermission("create");
  const canViewReports = useActionPermission("view", "reports");
  const hasLower = canCreate || canViewReports;
  if (!canEdit && !hasLower) return null;
  return (
    <div className="flex items-center justify-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label={`Actions for ${itemName}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem permission="edit" asChild>
            <Link href={`/b/${businessId}/inventory/items/${itemId}/edit`}>
              <FileEdit className="size-4 text-muted-foreground" /> Edit Item
            </Link>
          </DropdownMenuItem>
          {canEdit && hasLower && <DropdownMenuSeparator />}
          <DropdownMenuItem permission="create" asChild>
            <Link href={`/b/${businessId}/inventory/adjustments/new?itemId=${itemId}`}>
              <ClipboardPlus className="size-4 text-muted-foreground" /> Adjust Stock
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem permission="view" permissionModule="reports" asChild>
            <Link href={`/b/${businessId}/reports/inventory-movement?itemId=${itemId}`}>
              <BarChart3 className="size-4 text-muted-foreground" /> Stock Movement Report
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
