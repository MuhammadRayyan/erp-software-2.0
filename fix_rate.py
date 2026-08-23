import os

file_path = "src/modules/settlement/settlement-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("""  const rate = resolveRateSnapshot(sqlite, {
    currencyCode: invoice.currency_code,
    relevantDate: data.date,
    enforceVatPolicy: false,
  });""", """  const rate = resolveRateSnapshot(sqlite, {
    currencyCode: invoice.currency_code,
    exchangeRateToBase: data.exchangeRateToBase,
    exchangeRateDate: data.exchangeRateDate,
    exchangeRateSource: data.exchangeRateSource,
    relevantDate: data.date,
    enforceVatPolicy: false,
  });""")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
