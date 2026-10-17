"use client";

import Link from "next/link";
import {
  ChevronRight,
  MoreHorizontal,
  Eye,
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

export function InventoryItemRowActions({
  businessId,
  itemId,
  itemName,
}: {
  businessId: string;
  itemId: string;
  itemName: string;
}) {
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
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/inventory/items/${itemId}`}>
              <Eye className="size-4 text-muted-foreground" /> View Item Details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/inventory/items/${itemId}/edit`}>
              <FileEdit className="size-4 text-muted-foreground" /> Edit Item
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/inventory/adjustments/new?itemId=${itemId}`}>
              <ClipboardPlus className="size-4 text-muted-foreground" /> Adjust Stock
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/reports/inventory-movement?itemId=${itemId}`}>
              <BarChart3 className="size-4 text-muted-foreground" /> Stock Movement Report
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100"
      >
        <Link href={`/b/${businessId}/inventory/items/${itemId}`} aria-label={`Open ${itemName}`}>
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
