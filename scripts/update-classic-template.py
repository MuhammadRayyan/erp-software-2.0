import os

filepath = "src/modules/document-templates/react-pdf/classic-document-template.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

replacement = """
        {data.lines.length > 0 && (() => {
          const hasDiscount = data.lines.some(l => l.discount);
          const hasTax = data.lines.some(l => l.tax);
          return (
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableCell, { flex: 3, fontWeight: "heavy" }]}>Description</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>Qty</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>Rate</Text>
              {hasDiscount && <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>Discount</Text>}
              {hasTax && <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>Tax</Text>}
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>Amount</Text>
            </View>
            {data.lines.map((line, i) => (
              <View key={i} style={styles.tableRow} wrap={false}>
                <Text style={[styles.tableCell, { flex: 3 }]}>{line.description}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{line.quantity}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{line.unitPrice}</Text>
                {hasDiscount && <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{line.discount || "-"}</Text>}
                {hasTax && <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{line.tax || "-"}</Text>}
                <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{line.amount}</Text>
              </View>
            ))}
          </View>
        )})()}
"""

original = """
        {data.lines.length > 0 && (
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableCell, { flex: 3, fontWeight: "heavy" }]}>Description</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>Qty</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>Rate</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>Amount</Text>
            </View>
            {data.lines.map((line, i) => (
              <View key={i} style={styles.tableRow} wrap={false}>
                <Text style={[styles.tableCell, { flex: 3 }]}>{line.description}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{line.quantity}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{line.unitPrice}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{line.amount}</Text>
              </View>
            ))}
          </View>
        )}
"""

c = c.replace(original.strip(), replacement.strip())

# Render full width header image at the top if provided
c = c.replace(
    '<View style={styles.header}>',
    '{settings.headerImageUrl && <Image src={settings.headerImageUrl} style={{ width: "100%", height: "auto", marginBottom: 20 }} />}\n        <View style={styles.header}>'
)

# Render full width footer image at the bottom if provided
c = c.replace(
    '<Text style={{ fontSize: 9, color: colors.muted, textAlign: "center", marginTop: 40 }}>{settings.footerText}</Text>',
    '<Text style={{ fontSize: 9, color: colors.muted, textAlign: "center", marginTop: 40 }}>{settings.footerText}</Text>\n        {settings.footerImageUrl && <Image src={settings.footerImageUrl} style={{ width: "100%", height: "auto", marginTop: 20 }} />}'
)


with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
