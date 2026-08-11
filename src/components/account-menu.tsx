"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
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

export function AccountMenu({ user }: { user: { name: string; email: string } }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label={`Account menu for ${user.name}`}>
          <span className="grid size-7 place-items-center rounded-full bg-secondary text-secondary-foreground"><UserRound className="size-3.5" /></span>
          <span className="hidden text-[13px] sm:block">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel><span className="block text-foreground">{user.name}</span><span className="block font-normal">{user.email}</span></DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ThemeMenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/logout">Sign out</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
