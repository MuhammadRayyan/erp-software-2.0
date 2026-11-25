"use client";

import Link from "next/link";
import { MoreHorizontal, ContactRound, BookOpenText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ReceiptRowActions({
  businessId,
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
    </div>
  );
}
