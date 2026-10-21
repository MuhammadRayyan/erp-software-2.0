
"use client";

import { AlignJustify, Check, LayoutList, Rows2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTableDensity } from "@/components/use-table-density";

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
        <DropdownMenuItem onSelect={() => setDensity("compact")} className="flex items-center gap-2">
          <div className="flex size-4 items-center justify-center">
            {density === "compact" && <Check className="size-4" />}
          </div>
          Compact
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDensity("default")} className="flex items-center gap-2">
          <div className="flex size-4 items-center justify-center">
            {density === "default" && <Check className="size-4" />}
          </div>
          Default
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDensity("comfortable")} className="flex items-center gap-2">
          <div className="flex size-4 items-center justify-center">
            {density === "comfortable" && <Check className="size-4" />}
          </div>
          Comfortable
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

