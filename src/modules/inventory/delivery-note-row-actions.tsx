"use client";

import Link from "next/link";
import { ChevronRight, MoreHorizontal, Eye, FileEdit, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function DeliveryNoteRowActions({
  businessId,
  deliveryId,
  deliveryNumber,
  documentStatus,
}: {
  businessId: string;
  deliveryId: string;
  deliveryNumber: string;
  documentStatus: string;
}) {
  const canEdit = documentStatus === "draft";
  return (
    <div className="flex items-center justify-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label={`Actions for ${deliveryNumber}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/sales/delivery-notes/${deliveryId}`}>
              <Eye className="size-4 text-muted-foreground" /> View Details
            </Link>
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem permission="edit" asChild>
              <Link href={`/b/${businessId}/sales/delivery-notes/${deliveryId}/edit`}>
                <FileEdit className="size-4 text-muted-foreground" /> Edit Note
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem permission="export" asChild>
            <a
              href={`/api/businesses/${businessId}/documents/delivery-note/${deliveryId}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Download className="size-4 text-muted-foreground" /> Download PDF
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100"
      >
        <Link href={`/b/${businessId}/sales/delivery-notes/${deliveryId}`} aria-label={`Open ${deliveryNumber}`}>
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
