import os

filepath = "src/app/b/[businessId]/overview/page.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace(
    'import { getBankBalance } from "@/modules/reports/report-service";',
    'import { getBankBalance, getDashboardCounts } from "@/modules/reports/report-service";\nimport { ManagerSummary } from "./manager-summary";'
)

c = c.replace(
    '<KpiCards cards={cards} businessId={businessId} serverSnapshot={decodeColumnSnapshots(preferences)["overview-cards"]} />',
    '<KpiCards cards={cards} businessId={businessId} serverSnapshot={decodeColumnSnapshots(preferences)["overview-cards"]} />\n      <ManagerSummary businessId={businessId} counts={getDashboardCounts(businessId, user.id)} />'
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
