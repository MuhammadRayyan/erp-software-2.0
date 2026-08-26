import os

filepath = "src/modules/document-templates/react-pdf/modern-document-template.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

# Add discount and tax to DocumentTemplateData.lines
c = c.replace(
    'amount: string;',
    'amount: string;\n    discount?: string;\n    tax?: string;'
)

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
