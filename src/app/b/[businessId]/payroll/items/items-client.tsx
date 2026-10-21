"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, MoreHorizontal, ChevronRight, FileEdit, CheckCircle2, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { type PayslipItemRecord } from "@/modules/payroll/services/payroll-service";
import { savePayslipItemAction } from "@/modules/payroll/actions/payroll-actions";
import { ItemDialog } from "./item-dialog";

interface ItemsClientProps {
  businessId: string;
  items: PayslipItemRecord[];
  accounts: Array<{ id: string; name: string; type: string; subtype: string }>;
}

export function ItemsClient({ businessId, items, accounts }: ItemsClientProps) {
  const router = useRouter();
  const { density } = useTableDensity(businessId);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PayslipItemRecord | null>(null);

  const handleToggleItemActive = async (item: PayslipItemRecord) => {
    try {
      const res = await savePayslipItemAction(businessId, {
        id: item.id,
        name: item.name,
        type: item.type,
        accountId: item.accountId,
        description: item.description,
        isActive: !item.isActive,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(item.isActive ? `${item.name} marked inactive.` : `${item.name} marked active.`);
        router.refresh();
      }
    } catch {
      toast.error("Failed to update status.");
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      if (statusFilter === "active" && !i.isActive) return false;
      if (statusFilter === "inactive" && i.isActive) return false;

      if (!query.trim()) return true;
      const term = query.toLowerCase().trim();
      return (
        i.name.toLowerCase().includes(term) ||
        (i.accountName && i.accountName.toLowerCase().includes(term)) ||
        (i.description && i.description.toLowerCase().includes(term))
      );
    });
  }, [items, query, statusFilter]);

  const earnings = useMemo(() => filteredItems.filter((i) => i.type === "earnings"), [filteredItems]);
  const deductions = useMemo(() => filteredItems.filter((i) => i.type === "deduction"), [filteredItems]);

  const renderItemTable = (sectionItems: PayslipItemRecord[], emptyText: string) => {
    if (sectionItems.length === 0) {
      return (
        <div className="py-10 text-center text-xs text-muted-foreground">
          {emptyText}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="data-table min-w-[700px]" data-density={density}>
          <thead>
            <tr>
              <th>Item Name</th>
              <th>General Ledger Account</th>
              <th>Default Description</th>
              <th>Status</th>
              <th className="w-16 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {sectionItems.map((item) => (
              <tr key={item.id} className="group">
                <td>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItem(item);
                      setDialogOpen(true);
                    }}
                    className="text-left font-medium text-primary hover:underline"
                  >
                    {item.name}
                  </button>
                </td>
                <td className="text-foreground">
                  <span className="font-medium">{item.accountName || item.accountId}</span>
                </td>
                <td className="text-muted-foreground text-xs">
                  {item.description || "—"}
                </td>
                <td>
                  <StatusBadge status={item.isActive ? "active" : "inactive"} />
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          aria-label={`Actions for ${item.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedItem(item);
                            setDialogOpen(true);
                          }}
                        >
                          <FileEdit className="size-4 text-muted-foreground" /> Edit Item
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleToggleItemActive(item)}>
                          {item.isActive ? (
                            <>
                              <Ban className="size-4 text-danger" />
                              <span className="text-danger">Mark Inactive</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="size-4 text-success" />
                              <span className="text-success">Mark Active</span>
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                      onClick={() => {
                        setSelectedItem(item);
                        setDialogOpen(true);
                      }}
                      aria-label={`Open ${item.name}`}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };

  const hasActiveFilter = Boolean(query || statusFilter !== "all");

  return (
    <div className="space-y-6">
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search items by name, GL account..."
          ariaLabel="Search compensation items"
        />
        <ToolbarSelect
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filter by status"
          options={[
            { value: "all", label: "All Statuses" },
            { value: "active", label: "Active Only" },
            { value: "inactive", label: "Inactive Only" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <DensityToggle businessId={businessId} />
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
      </ListToolbar>

      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {statusFilter !== "all" && (
            <FilterChip onRemove={() => setStatusFilter("all")}>
              Status: {statusFilter === "active" ? "Active Only" : "Inactive Only"}
            </FilterChip>
          )}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}

      {/* Earnings Table Panel */}
      <div className="space-y-2">
        <div className="data-panel overflow-hidden">
          <div className="flex h-11 items-center justify-between border-b border-border bg-surface px-4">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">Earnings & Allowances</h4>
              <Badge tone="success" className="text-xs">Additions</Badge>
              <span className="text-xs text-muted-foreground tabular">({earnings.length})</span>
            </div>
          </div>
          {renderItemTable(earnings, "No earnings or allowance items found matching criteria.")}
        </div>
      </div>

      {/* Deductions Table Panel */}
      <div className="space-y-2">
        <div className="data-panel overflow-hidden">
          <div className="flex h-11 items-center justify-between border-b border-border bg-surface px-4">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">Deductions & Recoveries</h4>
              <Badge tone="warning" className="text-xs">Subtractions</Badge>
              <span className="text-xs text-muted-foreground tabular">({deductions.length})</span>
            </div>
          </div>
          {renderItemTable(deductions, "No deductions or recovery items found matching criteria.")}
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
