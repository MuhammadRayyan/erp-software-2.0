import os
import re

file_path = "src/modules/supplier-payments/supplier-payment-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = 'import { createSettlement, voidSettlement, type SettlementConfig } from "@/modules/settlement/settlement-service";\n' + content

config_str = """
const paymentConfig: SettlementConfig = {
  partyType: "supplier",
  partyTable: "suppliers",
  partyIdColumn: "supplier_id",
  documentTable: "purchase_invoices",
  documentIdColumn: "purchase_invoice_id",
  documentNumberColumn: "internal_number",
  openAmountExpr: `
    SELECT pi.total_minor - COALESCE(SUM(
      CASE WHEN sp.document_status = 'posted' THEN spa.foreign_amount_allocated ELSE 0 END
    ), 0) AS foreign_open_minor,
    pi.base_total_minor - COALESCE(SUM(
      CASE WHEN sp.document_status = 'posted' THEN spa.base_carrying_amount_released ELSE 0 END
    ), 0) AS base_carrying_minor
    FROM purchase_invoices pi
    LEFT JOIN supplier_payment_allocations spa ON spa.purchase_invoice_id = pi.id
    LEFT JOIN supplier_payments sp ON sp.id = spa.payment_id
    WHERE pi.id = ? GROUP BY pi.id
  `,
  paymentTable: "supplier_payments",
  paymentNumberColumn: "payment_number",
  allocationTable: "supplier_payment_allocations",
  allocationPaymentIdColumn: "payment_id",
  postSettlement: postSupplierPayment,
};
"""
content = content.replace('function payableOpenState(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], invoiceId: string) {', config_str + '\nfunction payableOpenState(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], invoiceId: string) {')
content = re.sub(r'function payableOpenState\(.*?\n}\n', '', content, flags=re.DOTALL)

def replace_func(func_name, replacement, text):
    start_idx = text.find(f"export function {func_name}")
    if start_idx == -1: return text
    
    brace_count = 0
    in_func = False
    end_idx = -1
    for i in range(start_idx, len(text)):
        if text[i] == '{':
            brace_count += 1
            in_func = True
        elif text[i] == '}':
            brace_count -= 1
        
        if in_func and brace_count == 0:
            end_idx = i
            break
            
    return text[:start_idx] + replacement + text[end_idx+1:]

create_payment_str = """export function createSupplierPayment(businessId: string, userId: string, input: SupplierPaymentInput) {
  const data = supplierPaymentInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  let result: any;
  context.sqlite.transaction(() => {
    result = createSettlement(context.sqlite, paymentConfig, data, userId);
  }).immediate();
  return result;
}"""

content = replace_func("createSupplierPayment", create_payment_str, content)

void_payment_str = """export function voidSupplierPayment(businessId: string, userId: string, paymentId: string) {
  const context = getBusinessDb(businessId, userId);
  context.sqlite.transaction(() => {
    voidSettlement(context.sqlite, paymentConfig, paymentId);
  }).immediate();
}"""

content = replace_func("voidSupplierPayment", void_payment_str, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
