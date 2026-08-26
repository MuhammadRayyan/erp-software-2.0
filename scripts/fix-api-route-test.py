import os
import re

filepath = "src/app/api/businesses/[businessId]/form-defaults/[formType]/route.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = "export const runtime = 'nodejs';\n" + c
c = c.replace('const user = await requireUser();', 'const user = await requireUser();\n    // we could also requireApiAuth(request) but requireUser checks session.')
c = c.replace('export async function GET(', 'import { requireApiAuth } from "@/core/auth/require-api-auth";\n\nexport async function GET(')
c = c.replace('const user = await requireUser();', 'const user = await requireUser();\n    await requireApiAuth(request);')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
