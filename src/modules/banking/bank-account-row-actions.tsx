"use client";

import Link from "next/link";
import {
  ChevronRight,
  MoreHorizontal,
  Eye,
  FileEdit,
  CheckCheck,
  Upload,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BankAccountRowActions({
  businessId,
  accountId,
  accountName,
  isCashAccount,
}: {
  businessId: string;
  accountId: string;
  accountName: string;
  isCashAccount: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label={`Actions for ${accountName}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/banking/accounts/${accountId}`}>
              <Eye className="size-4 text-muted-foreground" /> View Transactions
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/banking/accounts/${accountId}/edit`}>
              <FileEdit className="size-4 text-muted-foreground" /> Edit Account
            </Link>
          </DropdownMenuItem>
          {!isCashAccount && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/b/${businessId}/banking/accounts/${accountId}/reconcile`}>
                  <CheckCheck className="size-4 text-muted-foreground" /> Reconcile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/b/${businessId}/banking/accounts/${accountId}/import`}>
                  <Upload className="size-4 text-muted-foreground" /> Import Statement
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/b/${businessId}/banking/transactions/new?accountId=${accountId}`}>
              <PlusCircle className="size-4 text-muted-foreground" /> New Transaction
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
        <Link href={`/b/${businessId}/banking/accounts/${accountId}`} aria-label={`Open ${accountName}`}>
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
