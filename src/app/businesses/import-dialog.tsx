"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  Database,
  FileArchive,
  FileCheck2,
  FolderKanban,
  HardHat,
  LoaderCircle,
  Package,
  Receipt,
  ShoppingCart,
  Upload,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";

interface ManagerSummary {
  businessName: string;
  trn?: string;
  country: string;
  currency: string;
  customersCount: number;
  suppliersCount: number;
  inventoryItemsCount: number;
  fixedAssetsCount: number;
  projectsCount: number;
  accountsCount: number;
  bankAccountsCount: number;
  salesInvoicesCount: number;
  salesQuotesCount: number;
  salesOrdersCount?: number;
  purchaseInvoicesCount: number;
  receiptsCount?: number;
  paymentsCount?: number;
  bankTransfersCount: number;
  employeesCount?: number;
  payslipsCount?: number;
  journalEntriesCount?: number;
}

interface InspectionResult {
  type: "manager" | "uaemanager" | "ledgerly";
  summary?: ManagerSummary;
  manifest?: {
    originalBusinessName: string;
    exportedAt: string;
    country?: string;
    baseCurrencyCode?: string;
  };
  error?: string;
}

type ImportResult = {
  businessId?: string;
  businessName?: string;
  source?: string;
  error?: string;
};

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [inspection, setInspection] = useState<InspectionResult | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [documentStatus, setDocumentStatus] = useState<"posted" | "draft">("posted");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setInspection(null);
      return;
    }

    setInspecting(true);
    setError("");
    setInspection(null);

    const formData = new FormData();
    formData.append("backup", file);

    try {
      const response = await fetch("/api/businesses/import/inspect", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as InspectionResult;
      if (data.error) {
        setError(data.error);
        setInspection(null);
      } else {
        setInspection(data);
        if (data.type === "manager" && data.summary) {
          setBusinessName(data.summary.businessName);
        } else if ((data.type === "uaemanager" || data.type === "ledgerly") && data.manifest) {
          setBusinessName(`${data.manifest.originalBusinessName} (Imported)`);
        }
      }
    } catch {
      setError("Unable to inspect backup file. Verify connection and try again.");
      setInspection(null);
    } finally {
      setInspecting(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    if (businessName.trim()) {
      formData.set("businessName", businessName.trim());
    }
    formData.set("documentStatus", documentStatus);

    let result: ImportResult;
    try {
      const response = await fetch("/api/businesses/import", {
        method: "POST",
        body: formData,
      });
      result = (await response.json()) as ImportResult;
    } catch {
      setPending(false);
      setError("The backup upload was interrupted. Check your server connection and try again.");
      return;
    }
    setPending(false);
    if (result.error) return setError(result.error);

    setOpen(false);
    formRef.current?.reset();
    setInspection(null);
    toast.success(
      result.source === "manager.io"
        ? "Manager.io business workspace migrated successfully!"
        : "Business imported as a separate copy.",
    );
    if (result.businessId) router.push(`/b/${result.businessId}/overview`);
  }

  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen);
    if (!newOpen) {
      setError("");
      setInspection(null);
      setBusinessName("");
      setDocumentStatus("posted");
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Upload className="size-4" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogTitle>Import Business Backup</DialogTitle>
        <DialogDescription>
          Restore an existing UAE Manager (<code className="text-xs">.erpbackup</code>) or migrate a Manager.io (<code className="text-xs">.manager</code>) backup into a fresh workspace.
        </DialogDescription>
        <form ref={formRef} onSubmit={submit} className="mt-5 space-y-4">
          <div className="rounded-lg border border-dashed border-border-strong bg-surface p-4">
            <div className="flex items-center gap-2 mb-2 text-primary font-medium text-sm">
              <FileArchive className="size-5" />
              <span>Select Backup Archive</span>
            </div>
            <Label htmlFor="backup" className="sr-only">Backup file</Label>
            <Input
              id="backup"
              name="backup"
              type="file"
              accept=".erpbackup,.manager,application/zip,application/octet-stream"
              onChange={handleFileChange}
              className="mt-1.5 h-auto py-2 file:mr-3 file:border-0 file:bg-transparent file:text-sm"
              required
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Supports native <span className="font-semibold text-foreground">.erpbackup</span> and Manager.io <span className="font-semibold text-foreground">.manager</span> SQLite archives up to 50 MB.
            </p>
          </div>

          {inspecting && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-surface border text-sm text-muted-foreground animate-pulse">
              <LoaderCircle className="size-4 animate-spin text-primary" />
              <span>Inspecting database structure and entities...</span>
            </div>
          )}

          {inspection?.type === "manager" && inspection.summary && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="size-4 text-primary" />
                  <span className="font-semibold text-sm text-foreground">Manager.io Backup Verified</span>
                </div>
                <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {inspection.summary.currency} · {inspection.summary.country}
                </span>
              </div>

              <div className="text-xs space-y-1 text-muted-foreground">
                <div className="font-medium text-foreground text-sm flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-primary" />
                  {inspection.summary.businessName}
                </div>
                {inspection.summary.trn && (
                  <p>TRN / Tax ID: <span className="font-mono text-foreground font-medium">{inspection.summary.trn}</span></p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50 text-xs">
                <div className="flex items-center gap-1.5 bg-background/80 p-2 rounded border">
                  <Users className="size-3.5 text-blue-500" />
                  <div>
                    <div className="font-bold text-foreground">{inspection.summary.customersCount}</div>
                    <div className="text-[10px] text-muted-foreground">Customers</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-background/80 p-2 rounded border">
                  <Users className="size-3.5 text-indigo-500" />
                  <div>
                    <div className="font-bold text-foreground">{inspection.summary.suppliersCount}</div>
                    <div className="text-[10px] text-muted-foreground">Suppliers</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-background/80 p-2 rounded border">
                  <FolderKanban className="size-3.5 text-emerald-500" />
                  <div>
                    <div className="font-bold text-foreground">{inspection.summary.projectsCount}</div>
                    <div className="text-[10px] text-muted-foreground">Job Cards / Prj</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-background/80 p-2 rounded border">
                  <Package className="size-3.5 text-amber-500" />
                  <div>
                    <div className="font-bold text-foreground">{inspection.summary.inventoryItemsCount + inspection.summary.fixedAssetsCount}</div>
                    <div className="text-[10px] text-muted-foreground">Items & Assets</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-background/80 p-2 rounded border">
                  <Receipt className="size-3.5 text-violet-500" />
                  <div>
                    <div className="font-bold text-foreground">
                      {inspection.summary.salesInvoicesCount + inspection.summary.purchaseInvoicesCount}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {inspection.summary.salesInvoicesCount} Inv · {inspection.summary.purchaseInvoicesCount} Bills
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-background/80 p-2 rounded border">
                  <CheckCircle2 className="size-3.5 text-teal-500" />
                  <div>
                    <div className="font-bold text-foreground">{inspection.summary.bankAccountsCount} Banks</div>
                    <div className="text-[10px] text-muted-foreground">{inspection.summary.bankTransfersCount} Transfers</div>
                  </div>
                </div>

                {((inspection.summary.receiptsCount ?? 0) > 0 || (inspection.summary.paymentsCount ?? 0) > 0) && (
                  <div className="flex items-center gap-1.5 bg-background/80 p-2 rounded border">
                    <WalletCards className="size-3.5 text-sky-500" />
                    <div>
                      <div className="font-bold text-foreground">
                        {(inspection.summary.receiptsCount ?? 0) + (inspection.summary.paymentsCount ?? 0)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {inspection.summary.receiptsCount ?? 0} Rec · {inspection.summary.paymentsCount ?? 0} Pay
                      </div>
                    </div>
                  </div>
                )}

                {((inspection.summary.salesOrdersCount ?? 0) > 0 || (inspection.summary.salesQuotesCount ?? 0) > 0) && (
                  <div className="flex items-center gap-1.5 bg-background/80 p-2 rounded border">
                    <ShoppingCart className="size-3.5 text-orange-500" />
                    <div>
                      <div className="font-bold text-foreground">
                        {(inspection.summary.salesOrdersCount ?? 0) + (inspection.summary.salesQuotesCount ?? 0)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {inspection.summary.salesOrdersCount ?? 0} Orders · {inspection.summary.salesQuotesCount ?? 0} Quotes
                      </div>
                    </div>
                  </div>
                )}

                {((inspection.summary.employeesCount ?? 0) > 0 || (inspection.summary.payslipsCount ?? 0) > 0) && (
                  <div className="flex items-center gap-1.5 bg-background/80 p-2 rounded border">
                    <HardHat className="size-3.5 text-rose-500" />
                    <div>
                      <div className="font-bold text-foreground">
                        {inspection.summary.employeesCount ?? 0} Staff
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {inspection.summary.payslipsCount ?? 0} Payslips
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Posting Mode Toggle */}
              <div className="pt-2 border-t border-border/50">
                <Label className="text-xs font-medium text-foreground">Document Status on Import</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setDocumentStatus("posted")}
                    className={`flex flex-col text-left p-2.5 rounded-lg border transition-all ${
                      documentStatus === "posted"
                        ? "border-primary bg-primary/10 text-foreground font-medium ring-1 ring-primary"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-background"
                    }`}
                  >
                    <span className="flex items-center gap-1 text-foreground font-semibold">
                      <FileCheck2 className="size-3.5 text-primary" /> Active Ledger Mode
                    </span>
                    <span className="text-[11px] text-muted-foreground mt-0.5">
                      Recommended: Invoices & bills imported as posted with active balances & payment links.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDocumentStatus("draft")}
                    className={`flex flex-col text-left p-2.5 rounded-lg border transition-all ${
                      documentStatus === "draft"
                        ? "border-primary bg-primary/10 text-foreground font-medium ring-1 ring-primary"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-background"
                    }`}
                  >
                    <span className="flex items-center gap-1 text-foreground font-semibold">
                      <Receipt className="size-3.5 text-amber-500" /> Draft Review Mode
                    </span>
                    <span className="text-[11px] text-muted-foreground mt-0.5">
                      All documents imported as drafts for manual review before posting.
                    </span>
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <Label htmlFor="businessNameOverride" className="text-xs font-medium">New Workspace Name</Label>
                <Input
                  id="businessNameOverride"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Enter workspace name"
                  className="mt-1 text-sm bg-background"
                />
              </div>
            </div>
          )}

          {(inspection?.type === "uaemanager" || inspection?.type === "ledgerly") && inspection.manifest && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium text-sm">
                <CheckCircle2 className="size-4" />
                <span>UAE Manager Native Backup Verified</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Original Workspace: <span className="font-semibold text-foreground">{inspection.manifest.originalBusinessName}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Exported: {new Date(inspection.manifest.exportedAt).toLocaleDateString()}
              </p>
            </div>
          )}

          {error && <FormError message={error} />}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || inspecting}>
              {pending && <LoaderCircle className="size-4 animate-spin mr-1.5" />}
              {inspection?.type === "manager" ? "Migrate Manager.io Data" : "Import Copy"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
