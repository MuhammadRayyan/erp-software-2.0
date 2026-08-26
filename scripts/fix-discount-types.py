import os
import re

filepath = "src/app/api/businesses/[businessId]/documents/[documentType]/[documentId]/pdf/route.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('discount: line.discountType === "percentage"', 'discount: (line as any).discountType === "percentage"')
c = c.replace('? ${line.discountValue}%', '? ${(line as any).discountValue}%')
c = c.replace('? ${(line as any).discountValue}% : ((line as any).discountType === "fixed" ? formatMoney(Number((line as any).discountValue), currency) : undefined)', '? ${(line as any).discountValue}% : ((line as any).discountType === "fixed" ? formatMoney(Number((line as any).discountValue), currency) : undefined)')

# I will just regex replace all instances of line.discountType and line.discountValue to (line as any).
c = re.sub(r'line\.discountType', '(line as any).discountType', c)
c = re.sub(r'line\.discountValue', '(line as any).discountValue', c)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
