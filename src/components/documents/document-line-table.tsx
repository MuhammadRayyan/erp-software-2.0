"use client";

import { ReactNode, useState } from "react";
import type { UseFormRegister, FieldErrors, UseFormRegisterReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { formatMoney } from "@/core/format";
import type { DocumentLinePreview, DocumentLineTaxOption } from "./document-calculations";
import { DocumentTotalsPanel } from "./document-totals-panel";
import { DocumentColumnToggles } from "./document-column-toggles";

export interface DocumentLineItemOption {
  id: string;
  name: string;
  sku?: string | null;
  salesPriceMinor?: number | null;
  purchasePriceMinor?: number | null;
  salesAccountId?: string;
  inventoryAssetAccountId?: string;
}

export interface DocumentLineAccountOption {
  id: string;
  name: string;
}

export interface DocumentLineProjectOption {
  id: string;
  name: string;
  code?: string;
  customerId?: string | null;
  supplierId?: string | null;
}

export interface DocumentLineTableProps {
  // Form control
  register: UseFormRegister<any>;
  errors?: FieldErrors<any>;
  fields: { id: string }[];
  lines: any[];
  onAppend: () => void;
  onRemove: (index: number) => void;

  // Options
  items?: DocumentLineItemOption[];
  onItemSelect?: (index: number, itemId: string) => void;
  accounts: DocumentLineAccountOption[];
  accountFieldName: "salesAccountId" | "expenseAccountId";
  accountColumnLabel?: string;
  accountAriaLabel?: string;
  accountPlaceholder?: string;
  taxCodes?: DocumentLineTaxOption[];
  projects?: DocumentLineProjectOption[];

  // Currency & Previews
  currencyCode: string;
  minorUnit: number;
  previews: DocumentLinePreview[];
  amountsIncludeTax?: boolean;

  // Column toggles (controlled optional)
  showLineNumber?: boolean;
  onShowLineNumberChange?: (show: boolean) => void;
  showDescription?: boolean;
  onShowDescriptionChange?: (show: boolean) => void;
  showDiscounts?: boolean;
  onShowDiscountsChange?: (show: boolean) => void;
  showLineProjects?: boolean;
  onShowLineProjectsChange?: (show: boolean) => void;
  showLineTaxCodes?: boolean;
  onShowLineTaxCodesChange?: (show: boolean) => void;

  // Initial column toggles (uncontrolled)
  initialShowLineNumber?: boolean;
  initialShowDescription?: boolean;
  initialShowDiscounts?: boolean;
  initialShowProjects?: boolean;
  initialShowLineTaxCodes?: boolean;

  // Totals panel & toggles integration
  showTotalsSection?: boolean;
  subtotalMinor?: number;
  taxMinor?: number;
  baseEquivalentMinor?: number | null;
  baseCurrencyCode?: string;
  baseMinorUnit?: number;
  registerAmountsIncludeTax?: UseFormRegisterReturn;
}

export function DocumentLineTable({
  register,
  errors,
  fields,
  lines,
  onAppend,
  onRemove,
  items,
  onItemSelect,
  accounts,
  accountFieldName,
  accountColumnLabel = "Account",
  accountAriaLabel,
  accountPlaceholder,
  taxCodes = [],
  showLineTaxCodes: controlledShowLineTaxCodes,
  onShowLineTaxCodesChange,
  initialShowLineTaxCodes,
  projects,
  currencyCode,
  minorUnit,
  previews,
  amountsIncludeTax = false,
  showLineNumber: controlledShowLineNumber,
  onShowLineNumberChange,
  showDescription: controlledShowDescription,
  onShowDescriptionChange,
  showDiscounts: controlledShowDiscounts,
  onShowDiscountsChange,
  showLineProjects: controlledShowLineProjects,
  onShowLineProjectsChange,
  initialShowLineNumber = true,
  initialShowDescription = true,
  initialShowDiscounts,
  initialShowProjects,
  showTotalsSection = true,
  subtotalMinor = 0,
  taxMinor = 0,
  baseEquivalentMinor,
  baseCurrencyCode,
  baseMinorUnit,
  registerAmountsIncludeTax,
}: DocumentLineTableProps) {
  // Uncontrolled state fallbacks
  const [internalShowLineNumber, setInternalShowLineNumber] = useState(initialShowLineNumber);
  const [internalShowDescription, setInternalShowDescription] = useState(initialShowDescription);
  const [internalShowDiscounts, setInternalShowDiscounts] = useState(
    () => initialShowDiscounts ?? lines.some((l) => l?.discountType && l?.discountType !== "none")
  );
  const [internalShowProjects, setInternalShowProjects] = useState(
    () => initialShowProjects ?? lines.some((l) => Boolean(l?.projectId))
  );
  const [internalShowLineTaxCodes, setInternalShowLineTaxCodes] = useState(
    () => initialShowLineTaxCodes ?? controlledShowLineTaxCodes ?? true
  );

  const showLineNumber = controlledShowLineNumber ?? internalShowLineNumber;
  const setShowLineNumber = onShowLineNumberChange ?? setInternalShowLineNumber;

  const showDescription = controlledShowDescription ?? internalShowDescription;
  const setShowDescription = onShowDescriptionChange ?? setInternalShowDescription;

  const showDiscounts = controlledShowDiscounts ?? internalShowDiscounts;
  const setShowDiscounts = onShowDiscountsChange ?? setInternalShowDiscounts;

  const showLineProjects = controlledShowLineProjects ?? internalShowProjects;
  const setShowLineProjects = onShowLineProjectsChange ?? setInternalShowProjects;

  const showLineTaxCodes = onShowLineTaxCodesChange !== undefined
    ? (controlledShowLineTaxCodes ?? internalShowLineTaxCodes)
    : internalShowLineTaxCodes;
  const setShowLineTaxCodes = onShowLineTaxCodesChange ?? setInternalShowLineTaxCodes;

  const resolvedAccountAria =
    accountAriaLabel ?? (accountFieldName === "salesAccountId" ? "sales account" : "expense account");

  return (
    <div>
      {typeof errors?.lines?.message === "string" && (
        <p className="field-error mb-2">{errors.lines.message}</p>
      )}

      <div className="overflow-x-auto pb-3 -mx-1 px-1">
        <table className="line-item-table w-full">
          <thead>
            <tr>
              {showLineNumber && (
                <th className="w-10 text-center text-muted-foreground">#</th>
              )}
              {items && (
                <th className="w-[18%] min-w-[130px]">
                  Item <span className="font-normal text-muted-foreground">(optional)</span>
                </th>
              )}
              {showDescription && (
                <th className="min-w-[140px]">Description</th>
              )}
              <th className="w-20 min-w-[68px] text-right!">Qty</th>
              <th className="w-24 min-w-[80px] text-right!">Rate</th>
              {showDiscounts && (
                <th className="w-32 min-w-[105px] text-right!">Discount</th>
              )}
              <th className="w-[16%] min-w-[125px]">{accountColumnLabel}</th>
              {showLineTaxCodes && (
                <th className="w-[12%] min-w-[95px]">VAT</th>
              )}
              {showLineProjects && (
                <th className="w-[14%] min-w-[105px]">Project override</th>
              )}
              {!amountsIncludeTax && (
                <>
                  <th className="w-20 min-w-[70px] text-right!">Amount</th>
                  <th className="w-18 min-w-[65px] text-right!">Tax</th>
                </>
              )}
              <th className="w-24 min-w-[80px] text-right!">Total</th>
              <th className="w-10 text-center">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => {
              const line = lines[index];
              const preview = previews[index];
              const lineError = (errors?.lines as any)?.[index];

              return (
                <tr key={field.id}>
                  {showLineNumber && (
                    <td className="text-center text-muted-foreground align-middle py-2 text-xs font-medium">
                      {index + 1}
                    </td>
                  )}

                  {items && (
                    <td className="align-top">
                      <SelectNative
                        aria-label={`Line ${index + 1} inventory item`}
                        className="w-full text-xs"
                        {...register(`lines.${index}.itemId`, {
                          onChange: (event) => onItemSelect?.(index, event.target.value),
                        })}
                      >
                        <option value="">Service / free text</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.sku ? `${item.sku} — ` : ""}
                            {item.name}
                          </option>
                        ))}
                      </SelectNative>
                    </td>
                  )}

                  {showDescription && (
                    <td className="align-top min-w-0">
                      <Input
                        aria-label={`Line ${index + 1} description`}
                        className="w-full min-w-0 text-xs"
                        placeholder="Description..."
                        {...register(`lines.${index}.description`)}
                      />
                      {lineError?.description && (
                        <p className="field-error">{lineError.description.message}</p>
                      )}
                    </td>
                  )}

                  <td className="align-top">
                    <Input
                      className="money text-right w-full min-w-0 text-xs"
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      aria-label={`Line ${index + 1} quantity`}
                      {...register(`lines.${index}.quantity`)}
                    />
                  </td>

                  <td className="align-top">
                    <Input
                      className="money text-right w-full min-w-0 text-xs"
                      type="number"
                      step="0.000001"
                      min="0"
                      aria-label={`Line ${index + 1} rate`}
                      {...register(`lines.${index}.unitPrice`)}
                    />
                  </td>

                  {showDiscounts && (
                    <td className="align-top">
                      <div className="flex gap-1 justify-end min-w-0">
                        <select
                          aria-label={`Line ${index + 1} discount type`}
                          className="w-[62px] px-1.5 py-1 h-9 rounded-md border border-border-strong bg-surface-raised text-xs outline-none focus:border-primary focus:ring-1 focus:ring-ring"
                          {...register(`lines.${index}.discountType`)}
                        >
                          <option value="none">None</option>
                          <option value="percentage">%</option>
                          <option value="fixed">Fixed</option>
                        </select>
                        {line?.discountType && line.discountType !== "none" && (
                          <Input
                            aria-label={`Line ${index + 1} discount value`}
                            className="money w-16 text-right px-2 py-1 h-9 text-xs"
                            type="number"
                            step="any"
                            min="0"
                            {...register(`lines.${index}.discountValue`)}
                          />
                        )}
                      </div>
                    </td>
                  )}

                  <td className="align-top">
                    {line?.itemId ? (
                      <div className="h-9 flex items-center px-2.5 rounded-md bg-surface-muted/40 border border-transparent">
                        <input
                          type="hidden"
                          {...register(`lines.${index}.${accountFieldName}`)}
                        />
                        <span className="text-xs text-muted-foreground italic truncate">Auto (item)</span>
                      </div>
                    ) : (
                      <SelectNative
                        aria-label={`Line ${index + 1} ${resolvedAccountAria}`}
                        className="w-full text-xs"
                        {...register(`lines.${index}.${accountFieldName}`)}
                      >
                        {accountPlaceholder && (
                          <option value="">{accountPlaceholder}</option>
                        )}
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </SelectNative>
                    )}
                  </td>

                  {showLineTaxCodes && (
                    <td className="align-top">
                      <SelectNative
                        aria-label={`Line ${index + 1} tax code`}
                        className="w-full text-xs"
                        {...register(`lines.${index}.taxCodeId`)}
                      >
                        {taxCodes.map((taxCode) => (
                          <option key={taxCode.id} value={taxCode.id}>
                            {taxCode.name}
                          </option>
                        ))}
                      </SelectNative>
                    </td>
                  )}
                  {!showLineTaxCodes && (
                    <input type="hidden" {...register(`lines.${index}.taxCodeId`)} />
                  )}

                  {showLineProjects && (
                    <td className="align-top">
                      <SelectNative
                        aria-label={`Line ${index + 1} project`}
                        className="w-full text-xs"
                        {...register(`lines.${index}.projectId`)}
                      >
                        <option value="">Use document Project</option>
                        {projects?.map((project) => (
                          <option key={project.id} value={project.id}>
                            {"code" in project && project.code ? `${project.code} — ` : ""}
                            {project.name}
                          </option>
                        ))}
                      </SelectNative>
                    </td>
                  )}

                  {!amountsIncludeTax && (
                    <>
                      <td className="money text-right align-top text-xs pt-2.5">
                        {formatMoney(preview?.netMinor ?? 0, currencyCode, minorUnit)}
                      </td>
                      <td className="money text-right align-top text-xs text-muted-foreground pt-2.5">
                        {formatMoney(preview?.taxMinor ?? 0, currencyCode, minorUnit)}
                      </td>
                    </>
                  )}

                  <td className="money text-right align-top text-xs font-semibold pt-2.5">
                    {formatMoney(preview?.grossMinor ?? 0, currencyCode, minorUnit)}
                  </td>

                  <td className="align-top text-center pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-danger hover:bg-danger/10"
                      aria-label={`Remove line ${index + 1}`}
                      disabled={fields.length === 1}
                      title={fields.length === 1 ? "At least one line is required" : undefined}
                      onClick={() => onRemove(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="dashed-add-button mt-2"
        onClick={onAppend}
      >
        <Plus className="size-4" /> Add line
      </button>

      {showTotalsSection && (
        <div className="mt-5 flex flex-col md:flex-row items-start justify-between gap-6">
          <DocumentColumnToggles
            showLineNumber={showLineNumber}
            onShowLineNumberChange={setShowLineNumber}
            showDescription={showDescription}
            onShowDescriptionChange={setShowDescription}
            showDiscounts={showDiscounts}
            onShowDiscountsChange={setShowDiscounts}
            showLineProjects={showLineProjects}
            onShowLineProjectsChange={setShowLineProjects}
            showLineTaxCodes={showLineTaxCodes}
            onShowLineTaxCodesChange={setShowLineTaxCodes}
            registerAmountsIncludeTax={registerAmountsIncludeTax}
          />
          <DocumentTotalsPanel
            subtotalMinor={subtotalMinor}
            taxMinor={taxMinor}
            currencyCode={currencyCode}
            minorUnit={minorUnit}
            baseEquivalentMinor={baseEquivalentMinor}
            baseCurrencyCode={baseCurrencyCode}
            baseMinorUnit={baseMinorUnit}
          />
        </div>
      )}
    </div>
  );
}
