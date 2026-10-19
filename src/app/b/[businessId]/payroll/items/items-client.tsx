"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type PayslipItemRecord } from "@/modules/payroll/services/payroll-service";
import { ItemDialog } from "./item-dialog";

interface ItemsClientProps {
  businessId: string;
  items: PayslipItemRecord[];
  accounts: Array<{ id: string; name: string; type: string; subtype: string }>;
}

export function ItemsClient({ businessId, items, accounts }: ItemsClientProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PayslipItemRecord | null>(null);

  const earnings = items.filter((i) => i.type === "earnings");
  const deductions = items.filter((i) => i.type === "deduction");

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-base font-medium text-foreground">Predefined Compensation Categories</h3>
          <p className="text-xs text-muted-foreground">
            Configure line items with automatic General Ledger account posting.
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedItem(null);
            setDialogOpen(true);
          }}
          className="h-9"
        >
          <Plus className="size-4 mr-1.5" /> New Item
        </Button>
      </div>

      {/* Earnings Table */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span>Earnings & Allowances</span>
          <Badge tone="success" className="text-xs">Additions</Badge>
        </h4>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Item Name</th>
                <th className="py-3 px-4">General Ledger Account</th>
                <th className="py-3 px-4">Default Description</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {earnings.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-foreground">{item.name}</td>
                  <td className="py-3 px-4 text-foreground">{item.accountName || item.accountId}</td>
                  <td className="py-3 px-4 text-muted-foreground text-xs">{item.description || "-"}</td>
                  <td className="py-3 px-4 text-center">
                    <Badge tone={item.isActive ? "success" : "neutral"} className="text-xs">
                      {item.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedItem(item);
                        setDialogOpen(true);
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <Edit2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deductions Table */}
      <div className="space-y-2 pt-2">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span>Deductions & Recoveries</span>
          <Badge tone="warning" className="text-xs">Subtractions</Badge>
        </h4>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Item Name</th>
                <th className="py-3 px-4">General Ledger Account</th>
                <th className="py-3 px-4">Default Description</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deductions.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-foreground">{item.name}</td>
                  <td className="py-3 px-4 text-foreground">{item.accountName || item.accountId}</td>
                  <td className="py-3 px-4 text-muted-foreground text-xs">{item.description || "-"}</td>
                  <td className="py-3 px-4 text-center">
                    <Badge tone={item.isActive ? "success" : "neutral"} className="text-xs">
                      {item.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedItem(item);
                        setDialogOpen(true);
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <Edit2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ItemDialog
        businessId={businessId}
        item={selectedItem}
        accounts={accounts}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
