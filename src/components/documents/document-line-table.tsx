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
  showLineTaxCodes?: boolean;
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

  // Initial column toggles (uncontrolled)
  initialShowLineNumber?: boolean;
  initialShowDescription?: boolean;
  initialShowDiscounts?: boolean;
  initialShowProjects?: boolean;

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
  showLineTaxCodes = true,
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

  const showLineNumber = controlledShowLineNumber ?? internalShowLineNumber;
  const setShowLineNumber = onShowLineNumberChange ?? setInternalShowLineNumber;

  const showDescription = controlledShowDescription ?? internalShowDescription;
  const setShowDescription = onShowDescriptionChange ?? setInternalShowDescription;

  const showDiscounts = controlledShowDiscounts ?? internalShowDiscounts;
  const setShowDiscounts = onShowDiscountsChange ?? setInternalShowDiscounts;

  const showLineProjects = controlledShowLineProjects ?? internalShowProjects;
  const setShowLineProjects = onShowLineProjectsChange ?? setInternalShowProjects;

  const resolvedAccountAria =
    accountAriaLabel ?? (accountFieldName === "salesAccountId" ? "sales account" : "expense account");

  return (
    <div>
      {typeof errors?.lines?.message === "string" && (
        <p className="field-error mb-2">{errors.lines.message}</p>
      )}

      <div className="overflow-x-auto pb-4 -mx-2 px-2">
        <table className="line-item-table min-w-max w-full">
          <thead>
            <tr>
              {showLineNumber && (
                <th className="w-12 text-center text-muted-foreground">#</th>
              )}
              {items && (
                <th className="w-56 min-w-[200px]">
                  Item <span className="font-normal text-muted-foreground">(optional)</span>
                </th>
              )}
              {showDescription && (
                <th className="min-w-[220px]">Description</th>
              )}
              <th className="w-24 text-right!">Qty</th>
              <th className="w-32 text-right!">Rate</th>
              {showDiscounts && (
                <th className="w-36 text-right!">Discount</th>
              )}
              <th className="w-48">{accountColumnLabel}</th>
              {showLineTaxCodes && (
                <th className="w-40">VAT</th>
              )}
              {showLineProjects && (
                <th className="w-52">Project override</th>
              )}
              {!amountsIncludeTax && (
                <>
                  <th className="w-32 min-w-[110px] text-right!">Amount</th>
                  <th className="w-32 min-w-[110px] text-right!">Tax</th>
                </>
              )}
              <th className="w-36 min-w-[130px] text-right!">Total</th>
              <th className="w-12">
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
                    <td className="text-center text-muted-foreground align-middle py-2">
                      {index + 1}
                    </td>
                  )}

                  {items && (
                    <td className="align-top">
                      <SelectNative
                        aria-label={`Line ${index + 1} inventory item`}
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
                    <td className="align-top">
                      <Input
                        aria-label={`Line ${index + 1} description`}
                        {...register(`lines.${index}.description`)}
                      />
                      {lineError?.description && (
                        <p className="field-error">{lineError.description.message}</p>
                      )}
                    </td>
                  )}

                  <td className="align-top">
                    <Input
                      className="money text-right"
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      aria-label={`Line ${index + 1} quantity`}
                      {...register(`lines.${index}.quantity`)}
                    />
                  </td>

                  <td className="align-top">
                    <Input
                      className="money text-right"
                      type="number"
                      step="0.000001"
                      min="0"
                      aria-label={`Line ${index + 1} rate`}
                      {...register(`lines.${index}.unitPrice`)}
                    />
                  </td>

                  {showDiscounts && (
                    <td className="align-top">
                      <div className="flex gap-1 justify-end">
                        <select
                          aria-label={`Line ${index + 1} discount type`}
                          className="w-[70px] px-2 py-1 h-9 flex items-center justify-between rounded-md border border-input bg-transparent text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          {...register(`lines.${index}.discountType`)}
                        >
                          <option value="none">None</option>
                          <option value="percentage">%</option>
                          <option value="fixed">Fixed</option>
                        </select>
                        {line?.discountType && line.discountType !== "none" && (
                          <Input
                            aria-label={`Line ${index + 1} discount value`}
                            className="money w-20 text-right px-2 py-1 h-9"
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
                      <>
                        <input
                          type="hidden"
                          {...register(`lines.${index}.${accountFieldName}`)}
                        />
                        <span className="text-sm text-muted-foreground">From item</span>
                      </>
                    ) : (
                      <SelectNative
                        aria-label={`Line ${index + 1} ${resolvedAccountAria}`}
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
                      <td className="money text-right align-top">
                        {formatMoney(preview?.netMinor ?? 0, currencyCode, minorUnit)}
                      </td>
                      <td className="money text-right align-top text-muted-foreground">
                        {formatMoney(preview?.taxMinor ?? 0, currencyCode, minorUnit)}
                      </td>
                    </>
                  )}

                  <td className="money text-right align-top font-semibold">
                    {formatMoney(preview?.grossMinor ?? 0, currencyCode, minorUnit)}
                  </td>

                  <td className="align-top">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove line ${index + 1}`}
                      disabled={fields.length === 1}
                      title={fields.length === 1 ? "At least one line is required" : undefined}
                      onClick={() => onRemove(index)}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
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
