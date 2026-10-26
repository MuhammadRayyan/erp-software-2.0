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

export function GoodsReceiptRowActions({
  businessId,
  receiptId,
  receiptNumber,
  documentStatus,
}: {
  businessId: string;
  receiptId: string;
  receiptNumber: string;
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
            aria-label={`Actions for ${receiptNumber}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/purchases/goods-receipts/${receiptId}`}>
              <Eye className="size-4 text-muted-foreground" /> View Details
            </Link>
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem permission="edit" asChild>
              <Link href={`/b/${businessId}/purchases/goods-receipts/${receiptId}/edit`}>
                <FileEdit className="size-4 text-muted-foreground" /> Edit Receipt
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem permission="export" asChild>
            <a
              href={`/api/businesses/${businessId}/documents/goods-receipt/${receiptId}/pdf`}
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
        <Link href={`/b/${businessId}/purchases/goods-receipts/${receiptId}`} aria-label={`Open ${receiptNumber}`}>
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
