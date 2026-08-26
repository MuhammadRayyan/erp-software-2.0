import os

for filename in ["modern-document-template.tsx", "classic-document-template.tsx"]:
    filepath = f"src/modules/document-templates/react-pdf/{filename}"
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()

    # Determine if any line has discount/tax
    c = c.replace(
        '<View style={styles.table}>',
        'const hasDiscount = data.lines.some(l => l.discount);\n        const hasTax = data.lines.some(l => l.tax);\n        return (\n          <View style={styles.table}>'
    )
    c = c.replace(
        '<View style={styles.totals}>',
        ');\n        })()}\n        <View style={styles.totals}>'
    )
    c = c.replace(
        '<View style={styles.tableHeaderRow}>',
        '<View style={styles.tableHeaderRow}>'
    )
    
    # Wait, it's easier to use a Python script with regex to rewrite the whole table!
