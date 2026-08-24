"use client";
import { FormError } from "@/components/form-error";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveStockAdjustmentAction } from "./stock-adjustment-actions";
import {
  stockAdjustmentInputSchema,
  type StockAdjustmentInput,
} from "./stock-adjustment-input";
import type { InventoryDocumentStatus } from "./inventory-document";
import { SelectNative } from "@/components/ui/select-native";

type Item = {
  id: string;
  sku: string | null;
  name: string;
  unitName: string;
  purchasePriceMinor: number | null;
};

type Location = { id: string; code: string; name: string };
type Project = { id: string; code: string; name: string };


export function StockAdjustmentForm({
  businessId,
  adjustmentId,
  status = "draft",
  items,
  locations,
  projects,
  initial,
}: {
  businessId: string;
  adjustmentId?: string;
  status?: InventoryDocumentStatus;
  items: Item[];
  locations: Location[];
  projects: Project[];
  initial: StockAdjustmentInput;
}) {
  const [serverError, setServerError] = useState("");
  const form = useForm<StockAdjustmentInput>({
    resolver: zodResolver(stockAdjustmentInputSchema),
    defaultValues: initial,
  });
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = form;
  const reason = useWatch({ control, name: "reason" });

  async function save(values: StockAdjustmentInput, intent: "draft" | "post") {
    setServerError("");
    const result = await saveStockAdjustmentAction(
      businessId,
      adjustmentId ?? null,
      values,
      intent,
    );
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof StockAdjustmentInput, { message: messages[0] });
      }
    }
    if (result.error) setServerError(result.error);
  }

  return (
    <form className="max-w-4xl space-y-7 max-w-4xl" noValidate>
      {serverError && (
        <FormError message={serverError} />
      )}

      <section className="border-b border-border pb-7">
        <h2 className="text-base font-semibold">Adjustment details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use a positive quantity for stock in and a negative quantity for stock out.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...register("date")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locationId">Location</Label>
            <SelectNative id="locationId"  {...register("locationId")}>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} — {location.name}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="itemId">Inventory Item</Label>
            <SelectNative id="itemId"  {...register("itemId")}>
              <option value="">Choose item…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku ? `${item.sku} — ` : ""}
                  {item.name}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quantityChange">Quantity change</Label>
            <Input
              id="quantityChange"
              inputMode="decimal"
              placeholder="+5 or -2"
              {...register("quantityChange")}
              aria-invalid={!!errors.quantityChange}
            />
            {errors.quantityChange && (
              <p className="field-error">{errors.quantityChange.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <SelectNative id="reason"  {...register("reason")}>
              <option value="Stock count correction">Stock count correction</option>
              <option value="Damaged">Damaged</option>
              <option value="Opening Balance">Opening Balance</option>
              <option value="Other">Other</option>
            </SelectNative>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unitCost">
              Unit cost{" "}
              {reason !== "Opening Balance" && (
                <span className="font-normal text-muted-foreground">(opening only)</span>
              )}
            </Label>
            <Input id="unitCost" inputMode="decimal" {...register("unitCost")} />
            {reason === "Opening Balance" && (
              <p className="text-xs text-muted-foreground">
                Required for Opening Balance. Normal adjustments use current average cost.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="projectId">
              Project <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <SelectNative id="projectId"  {...register("projectId")}>
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.name}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="notes">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="notes" {...register("notes")} />
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 flex justify-between border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x">
        <Button asChild variant="ghost">
          <Link
            href={
              adjustmentId
                ? `/b/${businessId}/inventory/adjustments/${adjustmentId}`
                : `/b/${businessId}/inventory/adjustments`
            }
          >
            Cancel
          </Link>
        </Button>
        {status === "posted" ? (
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit((values) => save(values, "post"))}
          >
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
            Update Posted Adjustment
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={handleSubmit((values) => save(values, "draft"))}
            >
              Save Draft
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit((values) => save(values, "post"))}
            >
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
              Post Adjustment
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
