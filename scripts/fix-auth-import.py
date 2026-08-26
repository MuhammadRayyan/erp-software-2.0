import os

filepath = "src/app/api/businesses/[businessId]/form-defaults/[formType]/route.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('from "@/core/auth/require-api-auth"', 'from "@/core/auth/api-auth"')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)
