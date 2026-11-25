"use client";

import Link from "next/link";
import { MoreHorizontal, FileEdit, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionPermission } from "@/components/permissions-provider";

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
  const canEditPerm = useActionPermission("edit");
  const canExportPerm = useActionPermission("export");
  if (!(canEdit && canEditPerm) && !canExportPerm) return null;
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
          {canEdit && (
            <DropdownMenuItem permission="edit" asChild>
              <Link href={`/b/${businessId}/purchases/goods-receipts/${receiptId}/edit`}>
                <FileEdit className="size-4 text-muted-foreground" /> Edit Receipt
              </Link>
            </DropdownMenuItem>
          )}
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
    </div>
  );
}
