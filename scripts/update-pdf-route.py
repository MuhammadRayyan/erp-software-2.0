import os
import re

filepath = "src/app/api/businesses/[businessId]/documents/[documentType]/[documentId]/pdf/route.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

imports_to_add = """
import { getQuote } from "@/modules/sales-quotes/quote-service";
import { getSalesOrder } from "@/modules/sales-orders/sales-order-service";
"""

c = c.replace('import { getCreditNote } from "@/modules/sales-credit-notes/credit-note-service";', 'import { getCreditNote } from "@/modules/sales-credit-notes/credit-note-service";\n' + imports_to_add)

code_to_add = """
  } else if (documentType === "sales-quote") {
    const record = getQuote(businessId, session.user.id, documentId); if (!record) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    currency = record.quote.currencyCode; title = "SALES QUOTE"; number = record.quote.quoteNumber; partyName = record.customer.name; dateLabel = formatDate(record.quote.quoteDate); dueLabel = record.quote.expiryDate ? Expiry Date:  : "?""; if (currency !== access.business.currency) dueLabel +=   Rate 1  =    Base ; subtotalMinor = record.quote.subtotalMinor; taxMinor = record.quote.taxMinor; totalMinor = record.quote.totalMinor; rows = record.lines.map((line) => ({description: line.description, quantity: quantityMicrosToInput(line.quantityMicros), unitPrice: formatMoney(line.unitPriceMinor, currency), amount: formatMoney(line.grossAmountMinor, currency)}));
  } else if (documentType === "sales-order") {
    const record = getSalesOrder(businessId, session.user.id, documentId); if (!record) return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
    currency = record.order.currencyCode; title = "SALES ORDER"; number = record.order.orderNumber; partyName = record.customer.name; dateLabel = formatDate(record.order.orderDate); dueLabel = record.order.deliveryDate ? Delivery Date:  : "?""; if (currency !== access.business.currency) dueLabel +=   Rate 1  =    Base ; subtotalMinor = record.order.subtotalMinor; taxMinor = record.order.taxMinor; totalMinor = record.order.totalMinor; rows = record.lines.map((line) => ({description: line.description, quantity: quantityMicrosToInput(line.quantityMicros), unitPrice: formatMoney(line.unitPriceMinor, currency), amount: formatMoney(line.grossAmountMinor, currency)}));
"""

c = c.replace('} else if (documentType === "goods-receipt") {', code_to_add.strip() + '\n  } else if (documentType === "goods-receipt") {')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
