import os

file_path = "src/modules/receipts/receipt-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

def replace_func(func_name, replacement, text):
    start_idx = text.find(f"export function {func_name}")
    if start_idx == -1: return text
    
    # find the matching closing brace of the outermost function
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

create_receipt_str = """export function createReceipt(businessId: string, userId: string, input: ReceiptInput) {
  const data = receiptInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  let result: any;
  context.sqlite.transaction(() => {
    result = createSettlement(context.sqlite, receiptConfig, data, userId);
  }).immediate();
  return result;
}"""

content = replace_func("createReceipt", create_receipt_str, content)

void_receipt_str = """export function voidReceipt(businessId: string, userId: string, receiptId: string) {
  const context = getBusinessDb(businessId, userId);
  context.sqlite.transaction(() => {
    voidSettlement(context.sqlite, receiptConfig, receiptId);
  }).immediate();
}"""

content = replace_func("voidReceipt", void_receipt_str, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
