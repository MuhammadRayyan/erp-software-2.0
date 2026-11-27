"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Banknote, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { FormError } from "@/components/form-error";
import { StatusBadge } from "@/components/status-badge";
import { DialogClose, DialogContent, DialogDescription, DialogRoot, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useActionPermission } from "@/components/permissions-provider";
import { formatDate, formatMoney } from "@/core/format";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import {
  applyCreditNoteCreditAction,
  applyDebitNoteCreditAction,
  createCustomerRefundAction,
  createSupplierRefundAction,
  voidCustomerRefundAction,
  voidSupplierRefundAction,
} from "./party-credit-actions";

type Side = "customer" | "supplier";

export type NoteCreditPanelProps = {
  businessId: string;
  side: Side;
  noteId: string;
  noteNumber: string;
  noteDate: string;
  currencyCode: string;
  baseCurrencyCode: string;
  minorUnit: number;
  unallocatedMinor: number;
  today: string;
  openDocuments: Array<{ id: string; number: string; date: string; openMinor: number }>;
  bankAccounts: Array<{ id: string; name: string }>;
  applications: Array<{ documentId: string; documentNumber: string; amountMinor: number; isSource: boolean }>;
  refunds: Array<{ id: string; refundNumber: string; date: string; amountMinor: number; documentStatus: string; reference: string | null; bankAccountName: string }>;
};

const copy = {
  customer: {
    module: "sales" as const,
    title: "Customer credit",
    documentLabel: "invoice",
    documentPath: "sales/invoices",
    refundTitle: "Refund customer",
    refundDescription: "Pay the unallocated credit back to the customer from a bank or cash account (Dr Accounts Receivable, Cr Bank).",
    refundDone: "Refund posted.",
    empty: "All of this credit note's value has been used.",
  },
  supplier: {
    module: "purchases" as const,
    title: "Supplier credit",
    documentLabel: "purchase invoice",
    documentPath: "purchases/invoices",
    refundTitle: "Record supplier refund",
    refundDescription: "Record money the supplier paid back into a bank or cash account (Dr Bank, Cr Accounts Payable).",
    refundDone: "Supplier refund recorded.",
    empty: "All of this debit note's value has been used.",
  },
};

export function NoteCreditPanel(props: NoteCreditPanelProps) {
  const { businessId, side, noteId, currencyCode, minorUnit, unallocatedMinor } = props;
  const text = copy[side];
  const router = useRouter();
  const canPost = useActionPermission("post", text.module);
  const canVoid = useActionPermission("delete", text.module);
  const [pendingVoid, startVoid] = useTransition();
  const money = (amountMinor: number) => formatMoney(amountMinor, currencyCode, minorUnit);

  if (unallocatedMinor <= 0 && props.refunds.length === 0 && !props.applications.some((row) => !row.isSource)) return null;

  return (
    <section aria-label={text.title} className="mb-5 rounded-lg border border-border bg-surface-raised p-4 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">{text.title}</h2>
          <p className="mt-0.5 text-muted-foreground">
            {unallocatedMinor > 0
              ? <>Unallocated: <span className="money font-semibold text-foreground">{money(unallocatedMinor)}</span>. Apply it to another {text.documentLabel} or refund it.</>
              : text.empty}
          </p>
        </div>
        {unallocatedMinor > 0 && canPost && (
          <div className="flex flex-wrap gap-2">
            <ApplyCreditDialog {...props} />
            <RefundDialog {...props} />
          </div>
        )}
      </div>
      {(props.applications.length > 0 || props.refunds.length > 0) && (
        <div className="mt-4 overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Used for</th><th>Date</th><th className="text-right!">Amount</th><th /></tr></thead>
            <tbody>
              {props.applications.map((row) => (
                <tr key={`a-${row.documentId}`}>
                  <td>
                    {row.isSource ? "Settles source " : "Applied to "}
                    <Link className="tabular text-primary hover:underline" href={`/b/${businessId}/${text.documentPath}/${row.documentId}`}>{row.documentNumber}</Link>
                  </td>
                  <td className="text-muted-foreground">—</td>
                  <td className="money text-right">{money(row.amountMinor)}</td>
                  <td />
                </tr>
              ))}
              {props.refunds.map((row) => (
                <tr key={`r-${row.id}`}>
                  <td>
                    Refund <span className="tabular font-medium">{row.refundNumber}</span> · {row.bankAccountName}
                    {row.reference ? <span className="text-muted-foreground"> · {row.reference}</span> : null}
                    {row.documentStatus === "void" ? <span className="ml-2"><StatusBadge status="void" /></span> : null}
                  </td>
                  <td>{formatDate(row.date)}</td>
                  <td className="money text-right">{money(row.amountMinor)}</td>
                  <td className="text-right">
                    {row.documentStatus === "posted" && canVoid && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pendingVoid}
                        onClick={() => {
                          if (!window.confirm(`Void refund ${row.refundNumber}? A reversing journal entry is posted today.`)) return;
                          startVoid(async () => {
                            const result = side === "customer"
                              ? await voidCustomerRefundAction(businessId, row.id, noteId)
                              : await voidSupplierRefundAction(businessId, row.id, noteId);
                            if (result.error) {
                              toast.error(result.error);
                              return;
                            }
                            toast.success("Refund voided.");
                            router.refresh();
                          });
                        }}
                      >
                        Void
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ApplyCreditDialog({ businessId, side, noteId, noteNumber, currencyCode, minorUnit, unallocatedMinor, openDocuments }: NoteCreditPanelProps) {
  const text = copy[side];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [documentId, setDocumentId] = useState(openDocuments[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = openDocuments.find((row) => row.id === documentId) ?? openDocuments[0];
  const maxMinor = selected ? Math.min(selected.openMinor, unallocatedMinor) : 0;

  function reset(nextId: string) {
    const target = openDocuments.find((row) => row.id === nextId) ?? openDocuments[0];
    setDocumentId(target?.id ?? "");
    setAmount(target ? minorToCurrencyInput(Math.min(target.openMinor, unallocatedMinor), minorUnit) : "");
  }

  return (
    <DialogRoot open={open} onOpenChange={(next) => { setOpen(next); if (next) { setError(""); reset(documentId); } }}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="secondary" disabled={openDocuments.length === 0} title={openDocuments.length === 0 ? `No open ${currencyCode} ${text.documentLabel}s` : undefined}>
          <ArrowRightLeft className="size-4" /> Apply to {text.documentLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>Apply {noteNumber} credit</DialogTitle>
        <DialogDescription>Settle another open {text.documentLabel} of the same {side} with this credit.</DialogDescription>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            startTransition(async () => {
              const action = side === "customer" ? applyCreditNoteCreditAction : applyDebitNoteCreditAction;
              const result = await action(businessId, { noteId, documentId: selected?.id ?? "", amount });
              if (result.error) {
                setError(result.error);
                return;
              }
              setOpen(false);
              toast.success("Credit applied.");
              router.refresh();
            });
          }}
        >
          {error && <FormError message={error} />}
          <div className="space-y-1.5">
            <Label htmlFor="creditDocument">Open {text.documentLabel}</Label>
            <SelectNative id="creditDocument" value={selected?.id ?? ""} onChange={(event) => reset(event.target.value)}>
              {openDocuments.map((row) => (
                <option key={row.id} value={row.id}>{row.number} ({formatDate(row.date)}) · Open {formatMoney(row.openMinor, currencyCode, minorUnit)}</option>
              ))}
            </SelectNative>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="creditAmount">Amount ({currencyCode}) · max {formatMoney(maxMinor, currencyCode, minorUnit)}</Label>
            <Input id="creditAmount" type="number" step={minorUnit > 0 ? (10 ** -minorUnit).toFixed(minorUnit) : "1"} className="money text-right" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
            <Button type="submit" disabled={pending || !selected}>{pending && <LoaderCircle className="size-4 animate-spin" />} Apply credit</Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

function RefundDialog({ businessId, side, noteId, noteNumber, noteDate, currencyCode, baseCurrencyCode, minorUnit, unallocatedMinor, bankAccounts, today }: NoteCreditPanelProps) {
  const text = copy[side];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    date: today < noteDate ? noteDate : today,
    bankAccountId: bankAccounts[0]?.id ?? "",
    amount: minorToCurrencyInput(unallocatedMinor, minorUnit),
    exchangeRateToBase: "",
    reference: "",
    description: "",
  });
  const foreign = currencyCode !== baseCurrencyCode;
  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <DialogRoot open={open} onOpenChange={(next) => { setOpen(next); if (next) { setError(""); setForm((current) => ({ ...current, amount: minorToCurrencyInput(unallocatedMinor, minorUnit) })); } }}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" disabled={bankAccounts.length === 0}>
          <Banknote className="size-4" /> {side === "customer" ? "Refund" : "Record refund"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>{text.refundTitle} · {noteNumber}</DialogTitle>
        <DialogDescription>{text.refundDescription}</DialogDescription>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            startTransition(async () => {
              const action = side === "customer" ? createCustomerRefundAction : createSupplierRefundAction;
              const result = await action(businessId, {
                noteId,
                date: form.date,
                bankAccountId: form.bankAccountId,
                amount: form.amount,
                reference: form.reference,
                description: form.description,
                ...(foreign && form.exchangeRateToBase.trim()
                  ? { exchangeRateToBase: form.exchangeRateToBase.trim(), exchangeRateDate: form.date, exchangeRateSource: "Manual" }
                  : {}),
              });
              if (result.error) {
                setError(result.error);
                return;
              }
              setOpen(false);
              toast.success(text.refundDone);
              router.refresh();
            });
          }}
        >
          {error && <FormError message={error} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="refundDate">Date</Label>
              <Input id="refundDate" type="date" value={form.date} min={noteDate} onChange={update("date")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refundBank">Bank or cash account</Label>
              <SelectNative id="refundBank" value={form.bankAccountId} onChange={update("bankAccountId")}>
                {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </SelectNative>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refundAmount">Amount ({currencyCode}) · max {formatMoney(unallocatedMinor, currencyCode, minorUnit)}</Label>
              <Input id="refundAmount" type="number" step={minorUnit > 0 ? (10 ** -minorUnit).toFixed(minorUnit) : "1"} className="money text-right" value={form.amount} onChange={update("amount")} required />
            </div>
            {foreign && (
              <div className="space-y-1.5">
                <Label htmlFor="refundRate">Rate (1 {currencyCode} = ? {baseCurrencyCode})</Label>
                <Input id="refundRate" inputMode="decimal" placeholder="Saved rate for the date" value={form.exchangeRateToBase} onChange={update("exchangeRateToBase")} />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="refundReference">Reference</Label>
              <Input id="refundReference" maxLength={100} value={form.reference} onChange={update("reference")} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
            <Button type="submit" disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />} Post refund</Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
