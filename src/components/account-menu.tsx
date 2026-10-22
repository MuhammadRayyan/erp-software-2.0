"use client";

import Link from "next/link";
import { History, LayoutDashboard, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeMenu } from "@/core/theme/theme-menu";

export function AccountMenu({
  user,
  isInsideAdmin = false,
  businessId,
}: {
  user: { name: string; email: string; isSuperAdmin?: boolean };
  isInsideAdmin?: boolean;
  businessId?: string;
}) {
  const profileHref = businessId ? `/b/${businessId}/settings/profile` : "/profile";
  const activityLogHref = businessId
    ? `/b/${businessId}/settings/activity-log`
    : isInsideAdmin || user.isSuperAdmin
      ? "/admin?tab=audit"
      : "/businesses";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label={`Account menu for ${user.name}`}>
          <span className="grid size-7 place-items-center rounded-full bg-secondary text-secondary-foreground">
            <UserRound className="size-3.5" />
          </span>
          <span className="hidden max-w-28 truncate text-[13px] sm:block">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block font-medium text-foreground">{user.name}</span>
          <span className="block font-normal text-muted-foreground">{user.email}</span>
          {user.isSuperAdmin && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300">
              <ShieldCheck className="size-3" /> Platform Super-Admin
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ThemeMenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={profileHref} className="flex items-center gap-2">
            <UserRound className="size-4" /> Profile & Security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={activityLogHref} className="flex items-center gap-2">
            <History className="size-4" /> Activity Log
          </Link>
        </DropdownMenuItem>

        {user.isSuperAdmin && (
          <>
            {isInsideAdmin ? (
              <DropdownMenuItem asChild>
                <Link href="/businesses" className="flex items-center gap-2 font-medium text-primary">
                  <LayoutDashboard className="size-4" /> Switch to Business Overview
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem asChild>
                <Link href="/admin" className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                  <ShieldAlert className="size-4" /> Admin Control Panel
                </Link>
              </DropdownMenuItem>
            )}
          </>
        )}

        <DropdownMenuItem asChild>
          <Link href="/businesses">Switch business</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/logout">Sign out</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
