"use client";
import { FormError } from "@/components/form-error";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { saveStockAdjustmentAction } from "./stock-adjustment-actions";
import {
  stockAdjustmentInputSchema,
  type StockAdjustmentInput,
} from "./stock-adjustment-input";
import type { InventoryDocumentStatus } from "./inventory-document";
import { SelectNative } from "@/components/ui/select-native";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { FieldError } from "@/components/ui/field-error";
import { fieldErrorProps, fieldErrorId, applyServerFieldErrors, focusFirstInvalidField } from "@/lib/form-errors";

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
    setValue,
    control,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = form;
  useUnsavedChanges(isDirty && !isSubmitSuccessful);
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
      applyServerFieldErrors(setError, result.fieldErrors);
    }
    if (result.error) setServerError(result.error);
  }

  return (
    <form className="space-y-7 max-w-none" noValidate>
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
            <Input id="date" type="date" {...register("date")} {...fieldErrorProps("date", errors.date)} />
            <FieldError name="date" message={errors.date?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locationId">Location</Label>
            <Controller
              control={control}
              name="locationId"
              render={({ field }) => (
                <Combobox ref={field.ref}
                  id="locationId"
                  ariaInvalid={!!errors.locationId} ariaDescribedBy={errors.locationId ? fieldErrorId("locationId") : undefined}
                  options={locations.map((location) => ({
                    value: location.id,
                    label: `${location.code} — ${location.name}`,
                  }))}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  placeholder="Choose location…"
                  searchPlaceholder="Search locations…"
                  emptyText="No locations found."
                />
              )}
            />
            <FieldError name="locationId" message={errors.locationId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="itemId">Inventory Item</Label>
            <Controller
              control={control}
              name="itemId"
              render={({ field }) => (
                <Combobox ref={field.ref}
                  id="itemId"
                  ariaInvalid={!!errors.itemId} ariaDescribedBy={errors.itemId ? fieldErrorId("itemId") : undefined}
                  options={items.map((item) => ({
                    value: item.id,
                    label: `${item.sku ? `${item.sku} — ` : ""}${item.name}`,
                  }))}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  placeholder="Choose item…"
                  searchPlaceholder="Search inventory items…"
                  emptyText="No items found."
                />
              )}
            />
            <FieldError name="itemId" message={errors.itemId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quantityChange">Quantity change</Label>
            <Input
              id="quantityChange"
              inputMode="decimal"
              placeholder="+5 or -2"
              {...register("quantityChange")}
              {...fieldErrorProps("quantityChange", errors.quantityChange)}
            />
            {errors.quantityChange && (
              <p className="field-error">{errors.quantityChange.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <SelectNative
              id="reason"
              {...register("reason", {
                onChange: (event) => {
                  if (event.target.value !== "Opening Balance") {
                    setValue("unitCost", "");
                  }
                },
              })}
              {...fieldErrorProps("reason", errors.reason)}
            >
              <option value="Stock count correction">Stock count correction</option>
              <option value="Damaged">Damaged</option>
              <option value="Opening Balance">Opening Balance</option>
              <option value="Other">Other</option>
            </SelectNative>
            <FieldError name="reason" message={errors.reason?.message} />
          </div>
          {reason === "Opening Balance" && (
            <div className="space-y-1.5">
              <Label htmlFor="unitCost">Unit cost</Label>
              <Input id="unitCost" inputMode="decimal" {...register("unitCost")} {...fieldErrorProps("unitCost", errors.unitCost)} />
              <FieldError name="unitCost" message={errors.unitCost?.message} />
              <p className="text-xs text-muted-foreground">
                Required for Opening Balance. Normal adjustments use current average cost.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="projectId">
              Project <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Controller
              control={control}
              name="projectId"
              render={({ field }) => (
                <Combobox ref={field.ref}
                  id="projectId"
                  options={projects.map((project) => ({
                    value: project.id,
                    label: `${project.code} — ${project.name}`,
                  }))}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  allowClear
                  clearLabel="No project"
                  placeholder="No project"
                  searchPlaceholder="Search projects…"
                  emptyText="No projects found."
                />
              )}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="notes">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="notes" rows={2} placeholder="Reason for inventory adjustment / discrepancy notes..." {...register("notes")} {...fieldErrorProps("notes", errors.notes)} />
            <FieldError name="notes" message={errors.notes?.message} />
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
          <Button permission={["save", "post"]}
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit((values) => save(values, "post"), focusFirstInvalidField)}
          >
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
            Update Posted Adjustment
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button permission={"save"}
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={handleSubmit((values) => save(values, "draft"), focusFirstInvalidField)}
            >
              Save Draft
            </Button>
            <Button permission={["save", "post"]}
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit((values) => save(values, "post"), focusFirstInvalidField)}
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
