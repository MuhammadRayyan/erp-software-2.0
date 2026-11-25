"use client";

import Link from "next/link";
import { MoreHorizontal, Truck, BookOpenText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SupplierPaymentRowActions({
  businessId,
  paymentNumber,
  supplierId,
}: {
  businessId: string;
  paymentId: string;
  paymentNumber: string;
  supplierId: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label={`Actions for ${paymentNumber}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/suppliers/${supplierId}`}>
              <Truck className="size-4 text-muted-foreground" /> Supplier Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/suppliers/${supplierId}/statement`}>
              <BookOpenText className="size-4 text-muted-foreground" /> Supplier Statement
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
