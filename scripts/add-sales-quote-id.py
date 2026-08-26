import os
import re

# Update input schema
filepath = "src/modules/sales-orders/sales-order-input.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('reference: z.string().trim().max(100).optional().default(""),', 'reference: z.string().trim().max(100).optional().default(""),\n  salesQuoteId: z.string().uuid().optional().nullable(),')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

# Update service
filepath = "src/modules/sales-orders/sales-order-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

# Update SQL for UPDATE
c = re.sub(
    r"UPDATE sales_orders SET customer_id = \?, project_id = \?, order_date = \?, delivery_date = \?, reference = \?, document_status = \?, amounts_include_tax = \?, subtotal_minor = \?, tax_minor = \?, total_minor = \?, currency_code = \?, exchange_rate_to_base = \?, exchange_rate_date = \?, exchange_rate_source = \?, base_subtotal_minor = \?, base_tax_minor = \?, base_total_minor = \?, updated_at = \? WHERE id = \?",
    "UPDATE sales_orders SET customer_id = ?, project_id = ?, sales_quote_id = ?, order_date = ?, delivery_date = ?, reference = ?, document_status = ?, amounts_include_tax = ?, subtotal_minor = ?, tax_minor = ?, total_minor = ?, currency_code = ?, exchange_rate_to_base = ?, exchange_rate_date = ?, exchange_rate_source = ?, base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?, updated_at = ? WHERE id = ?",
    c
)
c = re.sub(
    r"\.run\(data\.customerId, data\.projectId \|\| null, data\.date, data\.expectedDate \|\| \"\", data\.reference \|\| null, nextStatus, data\.amountsIncludeTax \? 1 : 0, amounts\.subtotalMinor, amounts\.taxMinor, amounts\.totalMinor, rate\.currencyCode, rate\.exchangeRateToBase, rate\.exchangeRateDate, rate\.exchangeRateSource, base\.baseSubtotalMinor, base\.baseTaxMinor, base\.baseTotalMinor, now, orderId\);",
    ".run(data.customerId, data.projectId || null, data.salesQuoteId || null, data.date, data.expectedDate || \"\", data.reference || null, nextStatus, data.amountsIncludeTax ? 1 : 0, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, now, orderId);",
    c
)

# Update SQL for INSERT
c = re.sub(
    r"INSERT INTO sales_orders \(id, order_number, customer_id, project_id, order_date, delivery_date, reference, document_status, amounts_include_tax, subtotal_minor, tax_minor, total_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor, created_by, created_at, updated_at\) VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)",
    "INSERT INTO sales_orders (id, order_number, customer_id, project_id, sales_quote_id, order_date, delivery_date, reference, document_status, amounts_include_tax, subtotal_minor, tax_minor, total_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    c
)
c = re.sub(
    r"\.run\(id, orderNumber, data\.customerId, data\.projectId \|\| null, data\.date, data\.expectedDate \|\| \"\", data\.reference \|\| null, status, data\.amountsIncludeTax \? 1 : 0, amounts\.subtotalMinor, amounts\.taxMinor, amounts\.totalMinor, rate\.currencyCode, rate\.exchangeRateToBase, rate\.exchangeRateDate, rate\.exchangeRateSource, base\.baseSubtotalMinor, base\.baseTaxMinor, base\.baseTotalMinor, userId, now, now\);",
    ".run(id, orderNumber, data.customerId, data.projectId || null, data.salesQuoteId || null, data.date, data.expectedDate || \"\", data.reference || null, status, data.amountsIncludeTax ? 1 : 0, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, userId, now, now);",
    c
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
