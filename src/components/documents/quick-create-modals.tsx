"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderPlus, PackagePlus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/ui/form-field";
import { quickCreateCustomerAction } from "@/modules/customers/actions";
import { quickCreateSupplierAction } from "@/modules/suppliers/actions";
import { quickCreateInventoryItemAction } from "@/modules/inventory/actions";
import { quickCreateProjectAction } from "@/modules/projects/actions";

export interface QuickCreatedCustomer {
  id: string;
  name: string;
  defaultCurrencyCode: string;
  paymentTermsDays: number;
}

export interface QuickCreatedSupplier {
  id: string;
  name: string;
  defaultCurrencyCode: string;
  paymentTermsDays: number;
}

export interface QuickCreatedItem {
  id: string;
  sku: string | null;
  name: string;
  unitName: string;
  salesPriceMinor: number | null;
  purchasePriceMinor: number | null;
  salesAccountId: string;
  inventoryAssetAccountId: string;
  costOfSalesAccountId: string;
}

export interface QuickCreatedProject {
  id: string;
  code: string;
  name: string;
  customerId: string | null;
}

export function QuickCreateCustomerDialog({
  businessId,
  open,
  onOpenChange,
  initialName = "",
  defaultCurrencyCode,
  onCreated,
}: {
  businessId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  defaultCurrencyCode?: string;
  onCreated: (customer: QuickCreatedCustomer) => void;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [trn, setTrn] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (open) {
      setName(initialName);
      setEmail("");
      setPhone("");
      setTrn("");
      setError("");
      setFieldErrors({});
    }
  }, [open, initialName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSubmitting(true);
    setError("");
    setFieldErrors({});
    const res = await quickCreateCustomerAction(businessId, {
      name,
      email,
      phone,
      trn,
      defaultCurrencyCode,
    });
    setSubmitting(false);
    if (res.error || !res.customer) {
      setError(res.error ?? "The customer could not be created.");
      setFieldErrors(res.fieldErrors ?? {});
      return;
    }
    toast.success(`Customer "${res.customer.name}" created.`);
    onCreated(res.customer);
    onOpenChange(false);
  }

  return (
    <DialogRoot open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <UserPlus className="size-4 text-primary" />
          New Customer
        </DialogTitle>
        <DialogDescription>
          Quickly add a customer and select them on this document.
        </DialogDescription>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <FormField
            label="Customer name"
            htmlFor="quick-customer-name"
            required
            error={fieldErrors.name?.[0]}
          >
            <Input
              id="quick-customer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Al Noor Trading LLC"
              required
              autoFocus
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Email" htmlFor="quick-customer-email" optional error={fieldErrors.email?.[0]}>
              <Input
                id="quick-customer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="billing@company.ae"
              />
            </FormField>
            <FormField label="Phone" htmlFor="quick-customer-phone" optional error={fieldErrors.phone?.[0]}>
              <Input
                id="quick-customer-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+971 50 000 0000"
              />
            </FormField>
          </div>
          <FormField label="Tax Registration Number (TRN)" htmlFor="quick-customer-trn" optional error={fieldErrors.trn?.[0]}>
            <Input
              id="quick-customer-trn"
              value={trn}
              onChange={(e) => setTrn(e.target.value)}
              placeholder="15-digit UAE TRN"
            />
          </FormField>
          {error && <FormError message={error} />}
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create Customer
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

export function QuickCreateSupplierDialog({
  businessId,
  open,
  onOpenChange,
  initialName = "",
  defaultCurrencyCode,
  onCreated,
}: {
  businessId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  defaultCurrencyCode?: string;
  onCreated: (supplier: QuickCreatedSupplier) => void;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [trn, setTrn] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (open) {
      setName(initialName);
      setEmail("");
      setPhone("");
      setTrn("");
      setError("");
      setFieldErrors({});
    }
  }, [open, initialName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSubmitting(true);
    setError("");
    setFieldErrors({});
    const res = await quickCreateSupplierAction(businessId, {
      name,
      email,
      phone,
      trn,
      defaultCurrencyCode,
    });
    setSubmitting(false);
    if (res.error || !res.supplier) {
      setError(res.error ?? "The supplier could not be created.");
      setFieldErrors(res.fieldErrors ?? {});
      return;
    }
    toast.success(`Supplier "${res.supplier.name}" created.`);
    onCreated(res.supplier);
    onOpenChange(false);
  }

  return (
    <DialogRoot open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <UserPlus className="size-4 text-primary" />
          New Supplier
        </DialogTitle>
        <DialogDescription>
          Quickly add a supplier and select them on this document.
        </DialogDescription>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <FormField
            label="Supplier name"
            htmlFor="quick-supplier-name"
            required
            error={fieldErrors.name?.[0]}
          >
            <Input
              id="quick-supplier-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gulf Supplies FZCO"
              required
              autoFocus
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Email" htmlFor="quick-supplier-email" optional error={fieldErrors.email?.[0]}>
              <Input
                id="quick-supplier-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ap@supplier.ae"
              />
            </FormField>
            <FormField label="Phone" htmlFor="quick-supplier-phone" optional error={fieldErrors.phone?.[0]}>
              <Input
                id="quick-supplier-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+971 4 000 0000"
              />
            </FormField>
          </div>
          <FormField label="Tax Registration Number (TRN)" htmlFor="quick-supplier-trn" optional error={fieldErrors.trn?.[0]}>
            <Input
              id="quick-supplier-trn"
              value={trn}
              onChange={(e) => setTrn(e.target.value)}
              placeholder="15-digit UAE TRN"
            />
          </FormField>
          {error && <FormError message={error} />}
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create Supplier
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

export function QuickCreateItemDialog({
  businessId,
  open,
  onOpenChange,
  initialName = "",
  defaultMode = "sales",
  onCreated,
}: {
  businessId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  defaultMode?: "sales" | "purchase";
  onCreated: (item: QuickCreatedItem) => void;
}) {
  const [name, setName] = useState(initialName);
  const [sku, setSku] = useState("");
  const [unitName, setUnitName] = useState("pcs");
  const [salesPrice, setSalesPrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (open) {
      setName(initialName);
      setSku("");
      setUnitName("pcs");
      setSalesPrice("");
      setPurchasePrice("");
      setError("");
      setFieldErrors({});
    }
  }, [open, initialName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSubmitting(true);
    setError("");
    setFieldErrors({});
    const res = await quickCreateInventoryItemAction(businessId, {
      name,
      sku,
      unitName,
      salesPrice,
      purchasePrice,
    });
    setSubmitting(false);
    if (res.error || !res.item) {
      setError(res.error ?? "The inventory item could not be created.");
      setFieldErrors(res.fieldErrors ?? {});
      return;
    }
    toast.success(`Item "${res.item.name}" created.`);
    onCreated(res.item);
    onOpenChange(false);
  }

  return (
    <DialogRoot open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <PackagePlus className="size-4 text-primary" />
          New Inventory Item
        </DialogTitle>
        <DialogDescription>
          Uses default accounting mappings and adds the item straight to this line.
        </DialogDescription>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <FormField label="Item name" htmlFor="quick-item-name" required error={fieldErrors.name?.[0]}>
            <Input
              id="quick-item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. USB-C Hub 8-in-1"
              required
              autoFocus
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="SKU" htmlFor="quick-item-sku" optional error={fieldErrors.sku?.[0]}>
              <Input
                id="quick-item-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. SKU-104"
              />
            </FormField>
            <FormField label="Unit" htmlFor="quick-item-unit" required error={fieldErrors.unitName?.[0]}>
              <Input
                id="quick-item-unit"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="pcs"
                required
              />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Sales price" htmlFor="quick-item-sales-price" optional error={fieldErrors.salesPrice?.[0]}>
              <Input
                id="quick-item-sales-price"
                value={salesPrice}
                onChange={(e) => setSalesPrice(e.target.value)}
                placeholder="0.00"
                autoFocus={false}
              />
            </FormField>
            <FormField label="Purchase price" htmlFor="quick-item-purchase-price" optional error={fieldErrors.purchasePrice?.[0]}>
              <Input
                id="quick-item-purchase-price"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0.00"
                className={defaultMode === "purchase" ? "border-primary/40" : undefined}
              />
            </FormField>
          </div>
          {error && <FormError message={error} />}
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create Item
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

export function QuickCreateProjectDialog({
  businessId,
  open,
  onOpenChange,
  initialName = "",
  defaultCustomerId = "",
  customers = [],
  onCreated,
}: {
  businessId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  defaultCustomerId?: string;
  customers?: Array<{ id: string; name: string }>;
  onCreated: (project: QuickCreatedProject) => void;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState("");
  const [customerId, setCustomerId] = useState(defaultCustomerId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (open) {
      setName(initialName);
      setCode("");
      setCustomerId(defaultCustomerId);
      setError("");
      setFieldErrors({});
    }
  }, [open, initialName, defaultCustomerId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSubmitting(true);
    setError("");
    setFieldErrors({});
    const res = await quickCreateProjectAction(businessId, {
      name,
      code,
      customerId,
    });
    setSubmitting(false);
    if (res.error || !res.project) {
      setError(res.error ?? "The project could not be created.");
      setFieldErrors(res.fieldErrors ?? {});
      return;
    }
    toast.success(`Project "${res.project.name}" created.`);
    onCreated(res.project);
    onOpenChange(false);
  }

  return (
    <DialogRoot open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <FolderPlus className="size-4 text-primary" />
          New Project
        </DialogTitle>
        <DialogDescription>
          Create an active project and tag this document immediately.
        </DialogDescription>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <FormField label="Project name" htmlFor="quick-project-name" required error={fieldErrors.name?.[0]}>
            <Input
              id="quick-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dubai Marina Fit-out"
              required
              autoFocus
            />
          </FormField>
          <FormField label="Project code" htmlFor="quick-project-code" optional hint="Leave blank to auto-number." error={fieldErrors.code?.[0]}>
            <Input
              id="quick-project-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Auto-generated if empty"
            />
          </FormField>
          {customers.length > 0 && (
            <FormField label="Customer" htmlFor="quick-project-customer" optional error={fieldErrors.customerId?.[0]}>
              <SelectNative
                id="quick-project-customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">No specific customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectNative>
            </FormField>
          )}
          {error && <FormError message={error} />}
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create Project
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
