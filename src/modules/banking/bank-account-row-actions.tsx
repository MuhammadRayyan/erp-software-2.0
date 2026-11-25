"use client";

import Link from "next/link";
import {
  MoreHorizontal,
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
import { useActionPermission } from "@/components/permissions-provider";

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
  const canEdit = useActionPermission("edit");
  const canCreate = useActionPermission("create");
  const hasUpper = canEdit || (!isCashAccount && canCreate);
  const hasLower = canCreate;
  if (!hasUpper && !hasLower) return null;

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
          <DropdownMenuItem permission="edit" asChild>
            <Link href={`/b/${businessId}/banking/accounts/${accountId}/edit`}>
              <FileEdit className="size-4 text-muted-foreground" /> Edit Account
            </Link>
          </DropdownMenuItem>
          {!isCashAccount && (
            <>
              {canEdit && canCreate && <DropdownMenuSeparator />}
              <DropdownMenuItem permission="create" asChild>
                <Link href={`/b/${businessId}/banking/accounts/${accountId}/reconcile`}>
                  <CheckCheck className="size-4 text-muted-foreground" /> Reconcile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem permission="create" asChild>
                <Link href={`/b/${businessId}/banking/accounts/${accountId}/import`}>
                  <Upload className="size-4 text-muted-foreground" /> Import Statement
                </Link>
              </DropdownMenuItem>
            </>
          )}
          {hasUpper && hasLower && <DropdownMenuSeparator />}
          <DropdownMenuItem permission="create" asChild>
            <Link href={`/b/${businessId}/banking/transactions/new?accountId=${accountId}`}>
              <PlusCircle className="size-4 text-muted-foreground" /> New Transaction
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
