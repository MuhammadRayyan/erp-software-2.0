"use client";

import { useState } from "react";
import { Plus, Trash2, CheckCircle2, Star, Edit2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/form-error";
import type { PaymentTerm } from "../payment-terms-service";
import {
  createPaymentTermAction,
  updatePaymentTermAction,
  deletePaymentTermAction,
  setDefaultPaymentTermAction,
} from "../actions";

export function PaymentTermsManager({
  businessId,
  terms,
}: {
  businessId: string;
  terms: PaymentTerm[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [daysCount, setDaysCount] = useState<number>(30);
  const [termType, setTermType] = useState<"days_after_invoice" | "end_of_month">("days_after_invoice");
  const [isDefault, setIsDefault] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function startEdit(term: PaymentTerm) {
    setEditingId(term.id);
    setName(term.name);
    setDaysCount(term.days);
    setTermType(term.is_eom === 1 ? "end_of_month" : "days_after_invoice");
    setIsDefault(term.is_default === 1);
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setDaysCount(30);
    setTermType("days_after_invoice");
    setIsDefault(false);
    setError("");
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Please provide a name for the payment term (e.g. 'Net 30').");
      return;
    }
    setPending(true);
    setError("");

    if (editingId) {
      const res = await updatePaymentTermAction(businessId, editingId, {
        name,
        days_count: Number(daysCount),
        term_type: termType,
        is_default: isDefault,
      });
      setPending(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Payment term updated.");
    } else {
      const res = await createPaymentTermAction(businessId, {
        name,
        days_count: Number(daysCount),
        term_type: termType,
        is_default: isDefault,
      });
      setPending(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success("Payment term added.");
    }

    resetForm();
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this payment term?")) return;
    setPending(true);
    const res = await deletePaymentTermAction(businessId, id);
    setPending(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Payment term deleted.");
    router.refresh();
  }

  async function handleSetDefault(id: string) {
    setPending(true);
    const res = await setDefaultPaymentTermAction(businessId, id);
    setPending(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Default payment term updated.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            {editingId ? "Edit Payment Term" : "Add New Payment Term"}
          </h3>
          {editingId && (
            <Button variant="ghost" size="sm" onClick={resetForm} className="text-muted-foreground gap-1">
              <X className="size-4" /> Cancel Edit
            </Button>
          )}
        </div>

        {error && <FormError message={error} />}

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 items-end">
          <div className="space-y-1.5 md:col-span-1">
            <Label htmlFor="termName">Term Name</Label>
            <Input
              id="termName"
              placeholder="e.g. Net 30, Due on Receipt"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="termType">Calculation Type</Label>
            <select
              id="termType"
              value={termType}
              onChange={(e) => setTermType(e.target.value as any)}
              disabled={pending}
              className="w-full flex h-9 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="days_after_invoice">Days after invoice date</option>
              <option value="end_of_month">By end of month</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="daysCount">
              {termType === "end_of_month" ? "Additional Days" : "Net Days"}
            </Label>
            <Input
              id="daysCount"
              type="number"
              min="0"
              placeholder="0"
              value={daysCount}
              onChange={(e) => setDaysCount(Math.max(0, parseInt(e.target.value) || 0))}
              disabled={pending}
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                disabled={pending}
                className="size-4 rounded border-border text-primary focus:ring-ring"
              />
              <span>Set as default</span>
            </label>

            <Button onClick={handleSave} disabled={pending} className="gap-1.5 ml-auto">
              {editingId ? <CheckCircle2 className="size-4" /> : <Plus className="size-4" />}
              {editingId ? "Update" : "Add Term"}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-surface-muted/40">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Configured Payment Terms ({terms.length})
          </h3>
        </div>

        {terms.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No payment terms configured yet. Add your first preset above.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {terms.map((term) => (
              <div
                key={term.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 hover:bg-surface-muted/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{term.name}</span>
                      {term.is_default === 1 && (
                        <Badge tone="info" className="gap-1 text-xs border-primary/30 text-primary">
                          <Star className="size-3 fill-primary" /> Default
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {term.is_eom === 1
                        ? `End of month${term.days > 0 ? ` + ${term.days} days` : ""}`
                        : `${term.days} days from invoice date`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {term.is_default !== 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetDefault(term.id)}
                      disabled={pending}
                      className="text-xs text-muted-foreground hover:text-foreground gap-1"
                    >
                      <Star className="size-3.5" /> Make Default
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startEdit(term)}
                    disabled={pending}
                    className="size-8 text-muted-foreground hover:text-foreground"
                    title="Edit Term"
                  >
                    <Edit2 className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(term.id)}
                    disabled={pending}
                    className="size-8 text-muted-foreground hover:text-danger"
                    title="Delete Term"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
