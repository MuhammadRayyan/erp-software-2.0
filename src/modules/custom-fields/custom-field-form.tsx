"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ContactRound, Pencil, Plus, ReceiptText, Trash2, Truck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { EmptyState } from "@/components/empty-state";
import { FormError } from "@/components/form-error";
import type { CustomFieldDefinitionRow } from "./custom-field-service";
import {
  createCustomFieldAction,
  deleteCustomFieldAction,
  moveCustomFieldAction,
  updateCustomFieldAction,
} from "./actions";
import type { CustomFieldEntityType, CustomFieldFieldType } from "./custom-field-input";

const entityTypeLabels: Record<CustomFieldEntityType, string> = {
  customer: "Customers",
  supplier: "Suppliers",
  sales_invoice: "Sales Invoices",
};

const fieldTypeLabels: Record<CustomFieldFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Select",
  checkbox: "Checkbox",
};

type FormValues = {
  entityType: CustomFieldEntityType;
  name: string;
  fieldType: CustomFieldFieldType;
  selectOptions: string[];
  isRequired: boolean;
  showInList: boolean;
};

const emptyValues: FormValues = {
  entityType: "customer",
  name: "",
  fieldType: "text",
  selectOptions: [],
  isRequired: false,
  showInList: false,
};

const entityIcons: Record<CustomFieldEntityType, typeof ContactRound> = {
  customer: ContactRound,
  supplier: Truck,
  sales_invoice: ReceiptText,
};

export function CustomFieldsManager({
  businessId,
  definitions,
}: {
  businessId: string;
  definitions: CustomFieldDefinitionRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CustomFieldDefinitionRow | null | undefined>(undefined);
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CustomFieldDefinitionRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  function open(definition?: CustomFieldDefinitionRow) {
    setEditing(definition ?? null);
    setValues(definition ? {
      entityType: definition.entityType,
      name: definition.name,
      fieldType: definition.fieldType,
      selectOptions: definition.selectOptions,
      isRequired: definition.isRequired,
      showInList: definition.showInList,
    } : { ...emptyValues, entityType: definitions[0]?.entityType ?? "customer" });
    setErrors({});
    setServerError("");
  }

  async function save() {
    setPending(true);
    const payload = {
      ...values,
      name: values.name.trim(),
      selectOptions: values.selectOptions.map((option) => option.trim()).filter((option) => option !== ""),
    };
    const result = editing
      ? await updateCustomFieldAction(businessId, editing.id, payload)
      : await createCustomFieldAction(businessId, payload);
    setPending(false);
    setErrors(result.fieldErrors ?? {});
    if (result.error) return setServerError(result.error);
    setEditing(undefined);
    toast.success(editing ? "Custom field updated." : "Custom field created.");
    router.refresh();
  }

  async function move(definition: CustomFieldDefinitionRow, direction: "up" | "down") {
    setMovingId(definition.id);
    const result = await moveCustomFieldAction(businessId, definition.id, direction);
    setMovingId(null);
    if (result.error) return toast.error(result.error);
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    setDeletePending(true);
    const result = await deleteCustomFieldAction(businessId, deleting.id);
    setDeletePending(false);
    if (result.error) return toast.error(result.error);
    setDeleting(null);
    toast.success("Custom field deleted.");
    router.refresh();
  }

  const groups: CustomFieldEntityType[] = ["customer", "supplier", "sales_invoice"];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => open()}><Plus className="size-4" /> New Custom Field</Button>
      </div>
      <div className="space-y-8">
        {groups.map((entityType) => {
          const group = definitions.filter((definition) => definition.entityType === entityType);
          const Icon = entityIcons[entityType];
          return (
            <section key={entityType}>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {entityTypeLabels[entityType]} <span className="font-normal">({group.length})</span>
              </h2>
              {group.length === 0 ? (
                <EmptyState
                  icon={<Icon className="mx-auto mb-3 size-7 text-muted-foreground" />}
                  title={`No custom fields for ${entityTypeLabels[entityType].toLowerCase()}`}
                  description="Create one to capture extra information on every record."
                  action={<Button variant="secondary" size="sm" onClick={() => open()}><Plus className="size-4" /> New Custom Field</Button>}
                />
              ) : (
                <div className="data-panel overflow-x-auto">
                  <table className="data-table min-w-[720px]">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Required</th>
                        <th>Shows in list</th>
                        <th className="w-48"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((definition, index) => (
                        <tr key={definition.id}>
                          <td className="font-medium">
                            {definition.name}
                            {definition.fieldType === "select" && definition.selectOptions.length > 0 && (
                              <span className="block text-xs text-muted-foreground">{definition.selectOptions.join(" · ")}</span>
                            )}
                          </td>
                          <td>{fieldTypeLabels[definition.fieldType]}</td>
                          <td>
                            {definition.isRequired
                              ? <Badge tone="warning">Required</Badge>
                              : <Badge tone="neutral">Optional</Badge>}
                          </td>
                          <td>
                            {definition.showInList
                              ? <Badge tone="info">In list</Badge>
                              : <Badge tone="neutral">Form only</Badge>}
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" aria-label={`Move ${definition.name} up`} disabled={index === 0 || movingId === definition.id} onClick={() => move(definition, "up")}><ArrowUp className="size-3.5" /></Button>
                              <Button variant="ghost" size="icon" aria-label={`Move ${definition.name} down`} disabled={index === group.length - 1 || movingId === definition.id} onClick={() => move(definition, "down")}><ArrowDown className="size-3.5" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => open(definition)}><Pencil className="size-3.5" /> Edit</Button>
                              <Button variant="ghost" size="icon" aria-label={`Delete ${definition.name}`} onClick={() => setDeleting(definition)}><Trash2 className="size-3.5 text-danger" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <DialogRoot open={editing !== undefined} onOpenChange={(isOpen) => !isOpen && setEditing(undefined)}>
        <DialogContent>
          <DialogTitle>{editing ? "Edit custom field" : "New custom field"}</DialogTitle>
          <DialogDescription>Custom fields appear on the related forms; “Shows in list” fields are also added to list views.</DialogDescription>
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="custom-field-entity">Applies to</Label>
                <SelectNative id="custom-field-entity" value={values.entityType} onChange={(event) => setValues((current) => ({ ...current, entityType: event.target.value as CustomFieldEntityType }))}>
                  <option value="customer">Customers</option>
                  <option value="supplier">Suppliers</option>
                  <option value="sales_invoice">Sales Invoices</option>
                </SelectNative>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom-field-type">Field type</Label>
                <SelectNative id="custom-field-type" value={values.fieldType} onChange={(event) => setValues((current) => ({ ...current, fieldType: event.target.value as CustomFieldFieldType, selectOptions: event.target.value === "select" ? current.selectOptions : [] }))}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="select">Select</option>
                  <option value="checkbox">Checkbox</option>
                </SelectNative>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-field-name">Name</Label>
              <Input id="custom-field-name" value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} aria-invalid={!!errors.name} placeholder="e.g. Referral Source" />
              {errors.name && <p className="field-error">{errors.name[0]}</p>}
            </div>
            {values.fieldType === "select" && (
              <div className="space-y-1.5">
                <Label>Options</Label>
                <p className="text-xs text-muted-foreground">Users pick one of these values. Empty rows are dropped on save.</p>
                <div className="space-y-2">
                  {values.selectOptions.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={option}
                        aria-label={`Option ${index + 1}`}
                        onChange={(event) => setValues((current) => ({
                          ...current,
                          selectOptions: current.selectOptions.map((item, itemIndex) => itemIndex === index ? event.target.value : item),
                        }))}
                      />
                      <Button variant="ghost" size="icon" aria-label={`Remove option ${index + 1}`} onClick={() => setValues((current) => ({ ...current, selectOptions: current.selectOptions.filter((_, itemIndex) => itemIndex !== index) }))}>
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="secondary" size="sm" disabled={values.selectOptions.length >= 20} onClick={() => setValues((current) => ({ ...current, selectOptions: [...current.selectOptions, ""] }))}>
                  <Plus className="size-3.5" /> Add option
                </Button>
                {errors.selectOptions && <p className="field-error">{errors.selectOptions[0]}</p>}
              </div>
            )}
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input type="checkbox" checked={values.isRequired} onChange={(event) => setValues((current) => ({ ...current, isRequired: event.target.checked }))} className="size-4 accent-[var(--primary)]" />
              Required
            </label>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input type="checkbox" checked={values.showInList} onChange={(event) => setValues((current) => ({ ...current, showInList: event.target.checked }))} className="size-4 accent-[var(--primary)]" />
              Shows in list
            </label>
          </div>
          {serverError && <FormError message={serverError} />}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(undefined)}>Cancel</Button>
            <Button onClick={save} disabled={pending}>{editing ? "Save changes" : "Create field"}</Button>
          </div>
        </DialogContent>
      </DialogRoot>

      <DialogRoot open={deleting !== null} onOpenChange={(isOpen) => !isOpen && setDeleting(null)}>
        <DialogContent>
          <DialogTitle>Delete {deleting?.name}?</DialogTitle>
          <DialogDescription>This removes the field and every value stored on {deleting ? entityTypeLabels[deleting.entityType].toLowerCase() : "records"}. This cannot be undone.</DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove} disabled={deletePending}><Trash2 className="size-4" /> Delete field</Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
