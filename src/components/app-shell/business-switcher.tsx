"use client";

import Link from "next/link";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BusinessOption = { id: string; name: string };

export function BusinessSwitcher({ current, businesses }: { current: BusinessOption; businesses: BusinessOption[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start gap-2 px-2.5 py-2 text-left">
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-raised text-primary">
            <Building2 className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{current.name}</span>
            <span className="block text-[11px] font-normal text-muted-foreground">Current business</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch business</DropdownMenuLabel>
        {businesses.map((business) => (
          <DropdownMenuItem key={business.id} asChild>
            <Link href={`/b/${business.id}/overview`} className="justify-between">
              <span className="truncate">{business.name}</span>
              {business.id === current.id && <Check className="size-3.5 text-primary" />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/businesses"><Building2 className="size-4" /> All businesses</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/businesses/new"><Plus className="size-4" /> New business</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
