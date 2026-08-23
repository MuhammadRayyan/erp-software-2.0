import os
import re

files = [
    ("src/modules/sales-invoices/invoice-view-actions.tsx", "Invoice", "invoiceNumber", "invoices"),
    ("src/modules/sales-credit-notes/credit-note-view-actions.tsx", "Credit Note", "creditNoteNumber", "credit-notes"),
    ("src/modules/purchase-invoices/purchase-invoice-view-actions.tsx", "Purchase Invoice", "internalNumber", "purchase-invoices"),
    ("src/modules/purchase-orders/purchase-order-view-actions.tsx", "Purchase Order", "purchaseOrderNumber", "purchase-orders"),
    ("src/modules/receipts/receipt-view-actions.tsx", "Receipt", "receiptNumber", "receipts"),
    ("src/modules/supplier-payments/supplier-payment-view-actions.tsx", "Payment", "paymentNumber", "supplier-payments")
]

for file_path, doc_type, doc_num_col, route_name in files:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # The current structure export function InvoiceViewActions({ invoice }: { invoice: any })
    match = re.search(r"export function ([a-zA-Z]+ViewActions)\(\{\s*([a-zA-Z]+)\s*\}\s*:", content)
    if not match:
        continue
    
    func_name = match.group(1)
    prop_name = match.group(2)
    
    dup_match = re.search(r"import\s+\{[^}]*(duplicate[a-zA-Z]+Action)[^}]*\}\s+from", content)
    void_match = re.search(r"import\s+\{[^}]*(void[a-zA-Z]+Action)[^}]*\}\s+from", content)
    
    dup_action = dup_match.group(1) if dup_match else ""
    void_action = void_match.group(1) if void_match else ""

    # parse the original type if present
    type_match = re.search(r":\s*\{\s*" + prop_name + r"\s*:\s*([^}]+)\}", content)
    prop_type = type_match.group(1).strip() if type_match else "any"
    
    has_pdf = "pdf" in file_path or "invoice" in file_path or "order" in file_path or "credit" in file_path
    if "receipt" in file_path or "payment" in file_path:
        has_pdf = False
    
    pdf_attr = f'pdfHref={{`/b/${{{prop_name}.businessId}}/{route_name}/${{{prop_name}.id}}/pdf`}}' if has_pdf else ""
    
    actions_import = f"import {{ {dup_action}, {void_action} }} from \"./actions\";"
    if not dup_action:
        actions_import = f"import {{ {void_action} }} from \"./actions\";"
    if not void_action:
        continue # Should not happen

    new_content = f'''"use client";

{actions_import}
import {{ DocumentViewActions }} from "@/components/document-view-actions";
import {{ useRouter }} from "next/navigation";

export function {func_name}({{ {prop_name} }}: {{ {prop_name}: {prop_type} }}) {{
  const router = useRouter();

  return (
    <DocumentViewActions
      documentNumber={{{prop_name}.{doc_num_col}}}
      documentType="{doc_type}"
      editHref={{`/b/${{{prop_name}.businessId}}/{route_name}/${{{prop_name}.id}}/edit`}}
      {pdf_attr}
      status={{{prop_name}.documentStatus}}
      onDuplicate={{{dup_action} ? async () => {{
        const result = await {dup_action}({prop_name}.businessId, {prop_name}.id);
        if (!result.success) throw new Error(result.error);
        router.push(`/b/${{{prop_name}.businessId}}/{route_name}/${{result.data}}/edit`);
      }} : async () => {{}}}}
      onVoid={{async () => {{
        const result = await {void_action}({prop_name}.businessId, {prop_name}.id);
        if (!result.success) throw new Error(result.error);
        router.refresh();
      }}}}
    />
  );
}}
'''
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
