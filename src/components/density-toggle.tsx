
"use client";

import { AlignJustify, LayoutList, Rows2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTableDensity, type TableDensity } from "@/components/use-table-density";

export function DensityToggle({ businessId }: { businessId?: string }) {
  const { density, setDensity } = useTableDensity(businessId);
  
  const Icon = density === "compact" ? Rows2 : density === "comfortable" ? AlignJustify : LayoutList;
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" aria-label="Table density">
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onSelect={() => setDensity("compact")}>
          <span className="w-4">{density === "compact" ? "?" : ""}</span> Compact
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDensity("default")}>
          <span className="w-4">{density === "default" ? "?" : ""}</span> Default
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDensity("comfortable")}>
          <span className="w-4">{density === "comfortable" ? "?" : ""}</span> Comfortable
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

