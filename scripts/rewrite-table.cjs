const fs = require('fs');
const path = require('path');
const invoiceFormPath = path.join(__dirname, '../src/modules/sales-invoices/invoice-form.tsx');
let content = fs.readFileSync(invoiceFormPath, 'utf-8');

if (!content.includes('showLineNumber')) {
  content = content.replace(
    /const \\[showDiscounts, setShowDiscounts\\] = useState[^\n]+;/,
    \const [showDiscounts, setShowDiscounts] = useState(() => initial.lines.some((line) => line.discountType !== "none"));\\n  const [showLineNumber, setShowLineNumber] = useState(true);\\n  const [showDescription, setShowDescription] = useState(true);\\n  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(() => initial.lines[0]?.taxCodeId || taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id || taxCodes[0]?.id || "");\
  );
}

if (!content.includes('updateGlobalTax')) {
  content = content.replace(
    /function selectItem/,
    \unction updateGlobalTax(newTaxId: string) {\\n    setGlobalTaxCodeId(newTaxId);\\n    lines.forEach((_, i) => form.setValue(\\\lines.\.taxCodeId\\\, newTaxId));\\n  }\\n\\n  function selectItem\
  );
}

const start = content.indexOf('<section>\\n        <div className="mb-3 flex flex-wrap');
const end = content.indexOf('</section>\\n      {customFields');

if (start !== -1 && end !== -1) {
  const newSection = \<section className="border-b border-border pb-7">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Line items</h2>
            <p className="mt-1 text-sm text-muted-foreground">Select an item for inventory sales, or leave it blank for a service line.</p>
          </div>
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <Label htmlFor="globalTax" className="text-muted-foreground">Global Tax:</Label>
              <SelectNative id="globalTax" className="w-48" value={globalTaxCodeId} onChange={(e) => updateGlobalTax(e.target.value)}>
                {taxCodes.map((taxCode) => <option key={taxCode.id} value={taxCode.id}>{taxCode.name}</option>)}
              </SelectNative>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ itemId: "", description: "", quantity: "1", unitPrice: "0.00", discountType: "none", discountValue: "0", salesAccountId: defaultSalesAccountId, taxCodeId: globalTaxCodeId, projectId: "" })}>
              <Plus className="size-4" /> Add line
            </Button>
          </div>
        </div>
        
        {typeof errors.lines?.message === "string" && <p className="field-error mb-2">{errors.lines.message}</p>}
        
        <div className="rounded-lg border border-border bg-surface-raised w-full overflow-x-auto">
          <table className="data-table w-full whitespace-nowrap">
            <thead>
              <tr>
                {showLineNumber && <th className="w-12 text-center">#</th>}
                <th className="min-w-[200px]">Item <span className="font-normal text-muted-foreground">(optional)</span></th>
                {showDescription && <th className="min-w-[250px]">Description</th>}
                <th className="w-24 text-right!">Qty</th>
                <th className="w-32 text-right!">Rate</th>
                {showDiscounts && <th className="w-36 text-right!">Discount</th>}
                <th className="w-40">Account</th>
                {!amountsIncludeTax && <th className="w-28 text-right!">Amount</th>}
                {!amountsIncludeTax && <th className="w-28 text-right!">Tax</th>}
                <th className="w-32 text-right!">Total</th>
                <th className="w-12"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="hover:bg-transparent!">
                  {showLineNumber && <td className="py-2 text-center text-muted-foreground">{index + 1}</td>}
                  <td>
                    <SelectNative aria-label={\\\Line \ inventory item\\\} {...register(\\\lines.\.itemId\\\, { onChange: (event) => selectItem(index, event.target.value) })}>
                      <option value="">Service / free text</option>
                      {items.map((item) => <option key={item.id} value={item.id}>{item.sku ? \\\\ — \\\ : ""}{item.name}</option>)}
                    </SelectNative>
                  </td>
                  {showDescription && (
                    <td className="py-2">
                      <Input aria-label={\\\Line \ description\\\} {...register(\\\lines.\.description\\\)} />
                      {errors.lines?.[index]?.description && <p className="field-error">{errors.lines[index]?.description?.message}</p>}
                    </td>
                  )}
                  <td className="py-2">
                    <Input className="money text-right" type="number" step="0.0001" min="0.0001" aria-label={\\\Line \ quantity\\\} {...register(\\\lines.\.quantity\\\)} />
                  </td>
                  <td className="py-2">
                    <Input className="money text-right" type="number" step="0.000001" min="0" aria-label={\\\Line \ rate\\\} {...register(\\\lines.\.unitPrice\\\)} />
                  </td>
                  {showDiscounts && (
                    <td className="py-2">
                      <div className="flex gap-1 justify-end">
                        <SelectNative aria-label={\\\Line \ discount type\\\} className="w-[60px] px-1 py-1 h-9" {...register(\\\lines.\.discountType\\\)}>
                          <option value="none">None</option>
                          <option value="percentage">%</option>
                          <option value="fixed">Fixed</option>
                        </SelectNative>
                        {lines[index]?.discountType !== "none" && (
                          <Input aria-label={\\\Line \ discount value\\\} className="money w-20 text-right px-2 py-1 h-9" type="number" step="any" min="0" {...register(\\\lines.\.discountValue\\\)} />
                        )}
                      </div>
                    </td>
                  )}
                  <td className="py-2">
                    {lines[index]?.itemId ? (
                      <><input type="hidden" {...register(\\\lines.\.salesAccountId\\\)} /><span className="text-sm text-muted-foreground">From item</span></>
                    ) : (
                      <SelectNative aria-label={\\\Line \ sales account\\\} {...register(\\\lines.\.salesAccountId\\\)}>
                        {salesAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
                      </SelectNative>
                    )}
                    <input type="hidden" {...register(\\\lines.\.taxCodeId\\\)} />
                  </td>
                  
                  {!amountsIncludeTax && <td className="money text-right">{formatMoney(previews[index]?.netMinor ?? 0, currencyCode, minorUnit)}</td>}
                  {!amountsIncludeTax && <td className="money text-right">{formatMoney(previews[index]?.taxMinor ?? 0, currencyCode, minorUnit)}</td>}
                  
                  <td className="money text-right font-medium">{formatMoney(previews[index]?.grossMinor ?? 0, currencyCode, minorUnit)}</td>
                  <td>
                    <Button type="button" variant="ghost" size="icon" aria-label={\\\Remove line \\\\} disabled={fields.length === 1} onClick={() => remove(index)}>
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col md:flex-row items-start justify-between gap-6">
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="size-4 rounded-[4px] border-border-strong accent-primary" checked={showLineNumber} onChange={(e) => setShowLineNumber(e.target.checked)} />
              Column — Line number
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="size-4 rounded-[4px] border-border-strong accent-primary" checked={showDescription} onChange={(e) => setShowDescription(e.target.checked)} />
              Column — Description
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="size-4 rounded-[4px] border-border-strong accent-primary" checked={showDiscounts} onChange={(e) => setShowDiscounts(e.target.checked)} />
              Column — Discount
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="size-4 rounded-[4px] border-border-strong accent-primary" {...register("amountsIncludeTax")} />
              Amounts are tax inclusive
            </label>
          </div>

          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="money">{formatMoney(subtotalMinor, currencyCode, minorUnit)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT</dt>
              <dd className="money">{formatMoney(taxMinor, currencyCode, minorUnit)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="money">{formatMoney(subtotalMinor + taxMinor, currencyCode, minorUnit)}</dd>
            </div>
            {baseEquivalentMinor != null && (
              <div className="flex justify-between border-t border-border pt-2">
                <dt className="text-muted-foreground">Base equivalent</dt>
                <dd className="money">{formatMoney(baseEquivalentMinor, currency, baseMinorUnit)}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>\\n      \
  
  content = content.substring(0, start) + newSection + content.substring(end);
}

fs.writeFileSync(invoiceFormPath, content);
console.log("Rewrote table");
