"use client";

import Link from "next/link";
import { ChevronRight, MoreHorizontal, Eye, ContactRound, BookOpenText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ReceiptRowActions({
  businessId,
  receiptId,
  receiptNumber,
  customerId,
}: {
  businessId: string;
  receiptId: string;
  receiptNumber: string;
  customerId: string;
}) {
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
            <Link href={`/b/${businessId}/sales/receipts/${receiptId}`}>
              <Eye className="size-4 text-muted-foreground" /> View Receipt
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/customers/${customerId}`}>
              <ContactRound className="size-4 text-muted-foreground" /> Customer Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/customers/${customerId}/statement`}>
              <BookOpenText className="size-4 text-muted-foreground" /> Customer Statement
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
        <Link href={`/b/${businessId}/sales/receipts/${receiptId}`} aria-label={`Open ${receiptNumber}`}>
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
