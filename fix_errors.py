import os

file_path = "src/modules/settlement/settlement-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add currency check
currency_check = """
  if (data.currencyCode && data.currencyCode.toUpperCase() !== invoice.currency_code) {
    const typeLabel = config.partyType === "customer" ? "Receipt" : "Payment";
    throw new Error(`This ${data.currencyCode.toUpperCase()} ${typeLabel} can only allocate ${invoice.currency_code.toUpperCase()} invoices.`);
  }
"""
content = content.replace('if (!invoice) throw new Error("Invoice not found or not posted.");', 'if (!invoice) throw new Error("Invoice not found or not posted.");\n' + currency_check)

# Fix over-allocation errors
over_alloc_error = """
    if (config.partyType === "customer") {
      throw new Error("Receipt amount cannot exceed the invoice balance.");
    } else {
      throw new Error("Payment amount exceeds the selected payable.");
    }
"""
content = content.replace('throw new Error("Amount cannot exceed the balance.");', over_alloc_error)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
