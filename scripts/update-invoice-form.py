import os
import re

filepath = "src/modules/sales-invoices/invoice-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

# Add onDefaultSave to props
c = re.sub(
    r'export function InvoiceForm\(\{',
    'export function InvoiceForm({\n  onDefaultSave,',
    c
)

c = re.sub(
    r'customFields,\n\}\:\s*\{',
    'customFields,\n}: {\n  onDefaultSave?: (values: any, customValues: Record<string, string>) => Promise<{ error?: string; fieldErrors?: any } | undefined>;',
    c
)

# Replace the save function
new_save = """
  async function save(values: InvoiceInput, intent: InvoiceSaveIntent) {
    setServerError("");
    const missingCustomField = firstMissingRequiredCustomField(customFields, customValues);
    if (missingCustomField) {
      setServerError("" is required.);
      return;
    }
    
    if (onDefaultSave) {
      const result = await onDefaultSave(values, customValues);
      if (result?.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          setError(field as keyof InvoiceInput, { message: messages[0] });
        }
      }
      if (result?.error) setServerError(result.error);
      return;
    }

    const result = invoiceId
      ? await updateInvoiceAction(businessId, invoiceId, values, intent, customValues)
      : await createInvoiceAction(businessId, values, intent, customValues);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof InvoiceInput, { message: messages[0] });
      }
    }
    if (result.error) setServerError(result.error);
  }
"""

c = re.sub(
    r'async function save\(values\: InvoiceInput, intent\: InvoiceSaveIntent\)\s*\{[\s\S]*?if \(result\.error\) setServerError\(result\.error\);\s*\}',
    new_save.strip(),
    c
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
