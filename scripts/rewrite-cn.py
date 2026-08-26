
import os
import re

filepath = "src/modules/sales-credit-notes/credit-note-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Define the exact new section we want!
new_section = """
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Credited items</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the original revenue, VAT, and Project allocations for a clean reversal.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Default Tax</Label>
              <SelectNative
                className="h-8 max-w-[200px]"
                value={globalTaxCodeId}
                onChange={(e) => updateGlobalTax(e.target.value)}
              >
                {taxCodes.map((taxCode) => (
                  <option key={taxCode.id} value={taxCode.id}>
                    {taxCode.name}
                  </option>
                ))}
              </SelectNative>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-5"
              onClick={() =>
                append({
                  description: "",
                  quantity: "1",
                  unitPrice: "0.00",
                  discountType: "none",
                  discountValue: "0",
                  salesAccountId: defaultSales,
                  taxCodeId: globalTaxCodeId,
                  projectId: "",
                })
              }
            >
              <Plus className="size-4" /> Add line
            </Button>
          </div>
        </div>
        {typeof errors.lines?.message === "string" && (
          <p className="field-error mb-2">{errors.lines.message}</p>
        )}
        <div className="overflow-x-auto rounded-t-lg border border-border bg-surface-raised">
          <table className="data-table min-w-max">
            <thead>
              <tr>
                {showLineNumber && <th className="w-12 text-center text-muted-foreground">#</th>}
                {showDescription && (
                  <th className="min-w-[200px] py-3 text-left font-semibold text-muted-foreground">
                    Description
                  </th>
                )}
                <th className="min-w-[100px] py-3 text-right font-semibold text-muted-foreground">
                  Qty
                </th>
                <th className="min-w-[120px] py-3 text-right font-semibold text-muted-foreground">
                  Rate
                </th>
                {showDiscounts && (
                  <th className="min-w-[140px] py-3 text-right font-semibold text-muted-foreground">
                    Discount
                  </th>
                )}
                <th className="min-w-[150px] py-3 text-left font-semibold text-muted-foreground">
                  Sales account
                </th>
                <th className="min-w-[120px] py-3 text-left font-semibold text-muted-foreground">
                  Tax code
                </th>
                {showLineProjects && (
                  <th className="min-w-[150px] py-3 text-left font-semibold text-muted-foreground">
                    Project override
                  </th>
                )}
                {!amountsIncludeTax && (
                  <>
                    <th className="min-w-[100px] py-3 text-right font-semibold text-muted-foreground">
                      Amount
                    </th>
                    <th className="min-w-[100px] py-3 text-right font-semibold text-muted-foreground">
                      Tax
                    </th>
                  </>
                )}
                <th className="min-w-[120px] py-3 text-right font-semibold text-muted-foreground">
                  Total
                </th>
                <th className="w-12 py-3">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="hover:bg-transparent!">
                  {showLineNumber && (
                    <td className="py-2 text-center text-muted-foreground">
                      {index + 1}
                    </td>
                  )}
                  {showDescription && (
                    <td className="py-2">
                      <Input
                        aria-label={`Line ${index + 1} description`}
                        {...register(`lines.${index}.description`)}
                      />
                      {errors.lines?.[index]?.description && (
                        <p className="field-error">
                          {errors.lines[index]?.description?.message}
                        </p>
                      )}
                    </td>
                  )}
                  <td className="py-2">
                    <Input
                      className="money text-right"
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      aria-label={`Line ${index + 1} quantity`}
                      {...register(`lines.${index}.quantity`)}
                    />
                  </td>
                  <td className="py-2">
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
                    <td className="py-2">
                      <div className="flex rounded-md shadow-sm">
                        <select
                          className="-mr-px rounded-l-md border border-input bg-transparent px-2 text-sm text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
                          {...register(`lines.${index}.discountType`)}
                          aria-label={`Line ${index + 1} discount type`}
                        >
                          <option value="none">None</option>
                          <option value="percentage">%</option>
                          <option value="fixed">Fixed</option>
                        </select>
                        <Input
                          className="money min-w-[60px] rounded-l-none text-right"
                          type="number"
                          step={lines[index]?.discountType === "percentage" ? "1" : "0.01"}
                          min="0"
                          disabled={lines[index]?.discountType === "none" || !lines[index]?.discountType}
                          aria-label={`Line ${index + 1} discount value`}
                          {...register(`lines.${index}.discountValue`)}
                        />
                      </div>
                    </td>
                  )}
                  <td className="py-2">
                    <select
                      aria-label={`Line ${index + 1} sales account`}
                      className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      {...register(`lines.${index}.salesAccountId`)}
                    >
                      <option value="">Choose an account...</option>
                      {salesAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <select
                      aria-label={`Line ${index + 1} tax code`}
                      className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      {...register(`lines.${index}.taxCodeId`)}
                    >
                      {taxCodes.map((taxCode) => (
                        <option key={taxCode.id} value={taxCode.id}>
                          {taxCode.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  {showLineProjects && (
                    <td className="py-2">
                      <select
                        aria-label={`Line ${index + 1} project`}
                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        {...register(`lines.${index}.projectId`)}
                      >
                        <option value="">Use doc Project</option>
                        {eligibleProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.code} - {project.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  {!amountsIncludeTax && (
                    <>
                      <td className="py-2 text-right font-medium">
                        {formatMoney(
                          previews[index]?.netMinor ?? 0,
                          currencyCode,
                          minorUnit
                        )}
                      </td>
                      <td className="py-2 text-right font-medium text-muted-foreground">
                        {formatMoney(
                          previews[index]?.taxMinor ?? 0,
                          currencyCode,
                          minorUnit
                        )}
                      </td>
                    </>
                  )}
                  <td className="py-2 text-right font-bold">
                    {formatMoney(
                      previews[index]?.grossMinor ?? 0,
                      currencyCode,
                      minorUnit
                    )}
                  </td>
                  <td className="py-2 text-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove line ${index + 1}`}
                      disabled={fields.length === 1}
                      title={
                        fields.length === 1
                          ? "A credit note needs at least one line"
                          : undefined
                      }
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col-reverse justify-between gap-6 rounded-b-lg border border-t-0 border-border bg-surface-raised p-4 md:flex-row">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showLineNumber}
                onChange={(e) => setShowLineNumber(e.target.checked)}
              />{" "}
              Line number
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showDescription}
                onChange={(e) => setShowDescription(e.target.checked)}
              />{" "}
              Description
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showDiscounts}
                onChange={(e) => setShowDiscounts(e.target.checked)}
              />{" "}
              Discount
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showLineProjects}
                onChange={(e) => setShowLineProjects(e.target.checked)}
              />{" "}
              Project
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input type="checkbox" {...register("amountsIncludeTax")} />{" "}
              Amounts are tax inclusive
            </label>
          </div>
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="money">
                {formatMoney(subtotalMinor, currencyCode, minorUnit)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT</dt>
              <dd className="money">
                {formatMoney(taxMinor, currencyCode, minorUnit)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="money">
                {formatMoney(subtotalMinor + taxMinor, currencyCode, minorUnit)}
              </dd>
            </div>
          </dl>
        </div>
      </section>
"""

start_str = "<section>"
start_idx = content.find(start_str, content.find("Credited items") - 200)

end_str = "</section>"
end_idx = content.find(end_str, start_idx) + len(end_str)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_section + content[end_idx:]
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print("done")
else:
    print("section not found")

