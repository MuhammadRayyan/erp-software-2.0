import os

filepath = "src/modules/reports/report-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

new_fn = """
export function getDashboardCounts(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  
  const getCount = (table: string) => {
    try {
      const result = sqlite.prepare(SELECT COUNT(*) as c FROM ).get() as { c: number };
      return result.c;
    } catch {
      return 0; // table might not exist yet or error
    }
  };

  return {
    customers: getCount("customers"),
    salesQuotes: getCount("sales_quotes"),
    salesOrders: getCount("sales_orders"),
    salesInvoices: getCount("sales_invoices"),
    salesCreditNotes: getCount("sales_credit_notes"),
    suppliers: getCount("suppliers"),
    purchaseOrders: getCount("purchase_orders"),
    purchaseInvoices: getCount("purchase_invoices"),
    inventoryItems: getCount("inventory_items"),
    goodsReceipts: getCount("goods_receipts"),
    deliveryNotes: getCount("delivery_notes"),
    bankAccounts: getCount("accounts WHERE subtype IN ('bank', 'cash')"),
    receipts: getCount("receipts"),
    payments: getCount("supplier_payments"),
    journals: getCount("journal_entries")
  };
}
"""

c = c + "\n" + new_fn

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
