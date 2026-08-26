import os

filepath = "src/app/b/[businessId]/settings/page.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

# fix the stripped backticks
c = c.replace(
    'href: `/b//settings/form-defaults`,',
    'href: `/b/${businessId}/settings/form-defaults`,'
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)


filepath = "src/app/b/[businessId]/settings/form-defaults/page.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace(
    'import { getBusinessForUser } from "@/core/permissions/permissions";',
    'import { getBusinessForUser } from "@/core/businesses/business-service";'
)
# also check if the href was stripped here too
c = c.replace(
    'href={`/b//settings`}',
    'href={`/b/${businessId}/settings`}'
)
c = c.replace(
    'href={`/b//settings/form-defaults/`}',
    'href={`/b/${businessId}/settings/form-defaults/${form.id}`}'
)
c = c.replace(
    'href={`/b//settings/form-defaults/`}',
    'href={`/b/${businessId}/settings/form-defaults/${form.id}`}'
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
