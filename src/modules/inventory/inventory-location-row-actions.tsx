"use client";

import Link from "next/link";
import { ChevronRight, MoreHorizontal, Eye, FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function InventoryLocationRowActions({
  businessId,
  locationId,
  locationName,
}: {
  businessId: string;
  locationId: string;
  locationName: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label={`Actions for ${locationName}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/inventory/locations/${locationId}`}>
              <Eye className="size-4 text-muted-foreground" /> View Details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem permission="edit" asChild>
            <Link href={`/b/${businessId}/inventory/locations/${locationId}/edit`}>
              <FileEdit className="size-4 text-muted-foreground" /> Edit Location
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
        <Link href={`/b/${businessId}/inventory/locations/${locationId}`} aria-label={`Open ${locationName}`}>
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
