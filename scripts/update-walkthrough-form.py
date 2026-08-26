import os

filepath = "C:/Users/Rayyan/.gemini/antigravity/brain/128c0dfa-d217-418d-b02f-b5d1446b0a5b/walkthrough.md"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

new_walkthrough = """
## Form Defaults
- **DB Schema**: Appended orm_defaults table into the usiness-schema.ts (with unique index on orm_type) to persist document default JSON configurations. Successfully generated and ran un run db:migrate via usiness-migrations.ts.
- **API Backbone**: Engineered the PUT/GET src/app/api/businesses/[businessId]/form-defaults/[formType]/route.ts API route which will be responsible for blindly ferrying form data.
- **Settings UI**: Wove "Form Defaults" into the main settings directory and spun up src/app/b/[businessId]/settings/form-defaults/page.tsx mapping to sales-invoice, purchase-order, etc.
- **Inception Mapping**: Strategically refactored the generic InvoiceForm React component with a dynamic onDefaultSave?: (values, customValues) => void bypass prop. This guarantees the exact UX/UI you get when creating a document will be identical to configuring its default!
"""

c = c + "\n" + new_walkthrough.strip()

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
