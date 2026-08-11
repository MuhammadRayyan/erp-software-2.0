"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  archiveInboundEInvoiceAction,
  createPurchaseInvoiceDraftFromInboundAction,
  createSupplierFromInboundAction,
  injectMockInboundAction,
  rejectInboundEInvoiceAction,
  resolveLikelyDuplicateAction,
  selectInboundSupplierAction,
  updateInboundDocumentMatchAction,
  updateInboundLineMappingAction,
} from "./actions";
import { mockInboundScenarios, type MockInboundScenario } from "./mock-scenarios";

const selectClass = "h-9 rounded-md border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25";

const scenarioLabels: Record<MockInboundScenario, string> = {
  valid_invoice: "Valid Invoice",
  invalid_invoice: "Invalid Invoice",
  duplicate_invoice: "Duplicate Invoice",
  unknown_supplier: "Unknown Supplier",
  po_matched_invoice: "PO-matched Invoice",
  goods_receipt_matched_invoice: "Goods-Receipt-matched Invoice",
  vat_mismatch: "VAT mismatch",
  unsupported_credit_note: "Unsupported Credit Note",
};

export function MockInboundInjector({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [scenario, setScenario] = useState<MockInboundScenario>("valid_invoice");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function inject() {
    setError("");
    startTransition(async () => {
      const result = await injectMockInboundAction(businessId, scenario);
      if (result.error) return setError(result.error);
      if (result.documentId) router.push(`/b/${businessId}/purchases/einvoices/${result.documentId}?notice=${result.duplicateReceived ? "Duplicate received; existing archive retained" : "MOCK document received"}`);
    });
  }
  return <div className="rounded-lg border border-info/25 bg-info/5 p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold">MOCK inbound provider</p><p className="mt-1 text-xs text-muted-foreground">Local development fixtures only. No network or government service is contacted.</p></div><div className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="mock-inbound-scenario">Mock scenario</label><select id="mock-inbound-scenario" className={selectClass} value={scenario} onChange={(event) => setScenario(event.target.value as MockInboundScenario)}>{mockInboundScenarios.map((value) => <option key={value} value={value}>{scenarioLabels[value]}</option>)}</select><Button type="button" onClick={inject} disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />} Inject MOCK</Button></div></div>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
  </div>;
}

type SelectOption = { id: string; label: string; supplierId?: string; purchaseOrderId?: string | null };

export function SupplierResolutionControls({
  businessId,
  documentId,
  suppliers,
}: {
  businessId: string;
  documentId: string;
  suppliers: SelectOption[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function select() {
    if (!supplierId) return setError("Choose a Supplier.");
    startTransition(async () => {
      const result = await selectInboundSupplierAction(businessId, documentId, supplierId, true);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  }
  function create() {
    startTransition(async () => {
      const result = await createSupplierFromInboundAction(businessId, documentId);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  }
  return <div className="space-y-3"><div className="flex flex-wrap gap-2"><select className={`${selectClass} min-w-64`} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Select existing Supplier…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.label}</option>)}</select><Button type="button" onClick={select} disabled={pending || !supplierId}>{pending && <LoaderCircle className="size-4 animate-spin" />} Confirm identity</Button><Button type="button" variant="secondary" onClick={create} disabled={pending}>Create Supplier from source</Button></div>{error && <p role="alert" className="text-sm text-danger">{error}</p>}</div>;
}

export function ProcurementMatchControls({
  businessId,
  documentId,
  supplierId,
  purchaseOrderId: initialPurchaseOrderId,
  goodsReceiptId: initialGoodsReceiptId,
  purchaseOrders,
  goodsReceipts,
}: {
  businessId: string;
  documentId: string;
  supplierId: string;
  purchaseOrderId: string | null;
  goodsReceiptId: string | null;
  purchaseOrders: SelectOption[];
  goodsReceipts: SelectOption[];
}) {
  const router = useRouter();
  const [purchaseOrderId, setPurchaseOrderId] = useState(initialPurchaseOrderId ?? "");
  const [goodsReceiptId, setGoodsReceiptId] = useState(initialGoodsReceiptId ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const supplierOrders = purchaseOrders.filter((entry) => entry.supplierId === supplierId);
  const supplierReceipts = goodsReceipts.filter((entry) => (
    entry.supplierId === supplierId && (!purchaseOrderId || !entry.purchaseOrderId || entry.purchaseOrderId === purchaseOrderId)
  ));
  function save() {
    startTransition(async () => {
      const result = await updateInboundDocumentMatchAction(businessId, documentId, purchaseOrderId, goodsReceiptId);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  }
  return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs text-muted-foreground">Purchase Order<select className={`${selectClass} block w-full`} value={purchaseOrderId} onChange={(event) => { setPurchaseOrderId(event.target.value); setGoodsReceiptId(""); }}><option value="">No Purchase Order</option>{supplierOrders.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label><label className="space-y-1 text-xs text-muted-foreground">Goods Receipt<select className={`${selectClass} block w-full`} value={goodsReceiptId} onChange={(event) => setGoodsReceiptId(event.target.value)}><option value="">No Goods Receipt</option>{supplierReceipts.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label></div><Button type="button" size="sm" variant="secondary" onClick={save} disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />} Save procurement match</Button>{error && <p role="alert" className="text-sm text-danger">{error}</p>}</div>;
}

export function InboundLineMappingControls({
  businessId,
  documentId,
  line,
  purchaseOrderLines,
  items,
  expenseAccounts,
  taxCodes,
  projects,
}: {
  businessId: string;
  documentId: string;
  line: { id: string; purchaseOrderLineId: string | null; itemId: string | null; expenseAccountId: string | null; taxCodeId: string | null; projectId: string | null; supplierItemIdentifier: string | null };
  purchaseOrderLines: SelectOption[];
  items: SelectOption[];
  expenseAccounts: SelectOption[];
  taxCodes: SelectOption[];
  projects: SelectOption[];
}) {
  const router = useRouter();
  const [purchaseOrderLineId, setPurchaseOrderLineId] = useState(line.purchaseOrderLineId ?? "");
  const [itemId, setItemId] = useState(line.itemId ?? "");
  const [expenseAccountId, setExpenseAccountId] = useState(line.expenseAccountId ?? "");
  const [taxCodeId, setTaxCodeId] = useState(line.taxCodeId ?? "");
  const [projectId, setProjectId] = useState(line.projectId ?? "");
  const [saveSupplierItemMapping, setSaveSupplierItemMapping] = useState(Boolean(line.supplierItemIdentifier));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function save() {
    startTransition(async () => {
      const result = await updateInboundLineMappingAction(businessId, documentId, {
        lineId: line.id,
        purchaseOrderLineId,
        itemId,
        expenseAccountId: itemId ? "" : expenseAccountId,
        taxCodeId,
        projectId,
        saveSupplierItemMapping,
      });
      if (result.error) return setError(result.error);
      router.refresh();
    });
  }
  return <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-3">
    <select aria-label="Purchase Order line" className={selectClass} value={purchaseOrderLineId} onChange={(event) => setPurchaseOrderLineId(event.target.value)}><option value="">No PO line</option>{purchaseOrderLines.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>
    <select aria-label="Inventory Item" className={selectClass} value={itemId} onChange={(event) => setItemId(event.target.value)}><option value="">Expense / Service</option>{items.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>
    {!itemId && <select aria-label="Expense account" className={selectClass} value={expenseAccountId} onChange={(event) => setExpenseAccountId(event.target.value)}><option value="">Choose expense account…</option>{expenseAccounts.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>}
    <select aria-label="VAT code" className={selectClass} value={taxCodeId} onChange={(event) => setTaxCodeId(event.target.value)}><option value="">Choose VAT code…</option>{taxCodes.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>
    <select aria-label="Project" className={selectClass} value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No Project</option>{projects.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>
    <div className="flex flex-wrap items-center gap-3"><Button type="button" size="sm" variant="secondary" onClick={save} disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />} Confirm line mapping</Button>{line.supplierItemIdentifier && <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={saveSupplierItemMapping} onChange={(event) => setSaveSupplierItemMapping(event.target.checked)} /> Remember item ID</label>}</div>
    {error && <p role="alert" className="text-sm text-danger sm:col-span-2 xl:col-span-3">{error}</p>}
  </div>;
}

export function InboundReviewActions({ businessId, documentId, status, duplicateKind, isAdministrator }: { businessId: string; documentId: string; status: string; duplicateKind: string | null; isAdministrator: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function run(action: "draft" | "duplicate" | "reject" | "archive") {
    setError("");
    startTransition(async () => {
      const result = action === "draft"
        ? await createPurchaseInvoiceDraftFromInboundAction(businessId, documentId)
        : action === "duplicate"
          ? await resolveLikelyDuplicateAction(businessId, documentId, reason)
          : action === "reject"
            ? await rejectInboundEInvoiceAction(businessId, documentId, reason)
            : await archiveInboundEInvoiceAction(businessId, documentId, reason);
      if (result?.error) return setError(result.error);
      router.refresh();
    });
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">{status === "ReadyForDraft" && <Button type="button" onClick={() => run("draft")} disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />} Create Purchase Invoice Draft</Button>}{duplicateKind === "likely" && <Button type="button" variant="secondary" onClick={() => run("duplicate")} disabled={pending || reason.trim().length < 3}>Confirm as distinct</Button>}</div>
    {(duplicateKind === "likely" || isAdministrator) && !["Processed", "Archived"].includes(status) && <div className="flex flex-col gap-2 sm:flex-row"><input className="h-9 min-w-64 flex-1 rounded-md border border-border-strong bg-surface-raised px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required review reason" />{isAdministrator && <><Button type="button" variant="danger" onClick={() => run("reject")} disabled={pending || reason.trim().length < 3}>Reject</Button><Button type="button" variant="ghost" onClick={() => run("archive")} disabled={pending || reason.trim().length < 3}>Archive</Button></>}</div>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </div>;
}
