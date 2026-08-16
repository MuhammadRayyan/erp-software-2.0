"use client";

import { Printer } from "lucide-react";
import { Button } from "./ui/button";

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4 mr-1.5" /> Print Statement
    </Button>
  );
}
