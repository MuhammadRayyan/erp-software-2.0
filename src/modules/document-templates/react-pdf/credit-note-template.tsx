import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { sharedStyles, colors } from "./primitives";
import type { TemplateSettings } from "../template-settings";
import type { InvoiceTemplateData } from "./invoice-template";

const styles = StyleSheet.create({
  ...sharedStyles,
  logo: { width: 120, height: 40, objectFit: "contain" },
  invoiceTitle: { fontSize: 24, fontWeight: "heavy" },
  customerName: { fontSize: 12, fontWeight: "heavy" },
});

export function CreditNoteDocument({ data, settings }: { data: InvoiceTemplateData; settings: TemplateSettings }) {
  const primaryColor = settings.primaryColor || colors.text;

  return (
    <Document>
      <Page size="A4" style={[styles.page, { fontFamily: settings.fontName }]}>
        <View style={styles.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {settings.logoUrl && <Image src={settings.logoUrl} style={styles.logo} />}
            <Text style={{ marginTop: 8, color: primaryColor, fontWeight: "heavy" }}>{data.companyName}</Text>
            {settings.headerText && <Text style={{ fontSize: 8, color: colors.muted }}>{settings.headerText}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.invoiceTitle, { color: primaryColor }]}>CREDIT NOTE</Text>
            <Text style={{ marginTop: 4 }}>{data.invoiceNumber}</Text>
            <Text style={{ fontSize: 9, color: colors.muted }}>{data.invoiceDate}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>Credit To</Text>
          <Text style={styles.customerName}>{data.customerName}</Text>
          {data.customerAddress && <Text style={{ fontSize: 9, color: colors.muted }}>{data.customerAddress}</Text>}
        </View>

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

        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text style={{ color: colors.muted }}>Subtotal</Text>
            <Text>{data.subtotal}</Text>
          </View>
          {settings.showTaxColumn && (
            <View style={styles.totalsRow}>
              <Text style={{ color: colors.muted }}>VAT</Text>
              <Text>{data.tax}</Text>
            </View>
          )}
          <View style={[styles.totalsRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4, marginTop: 4 }]}>
            <Text style={{ fontWeight: "heavy", fontSize: 12 }}>Total Credit</Text>
            <Text style={{ fontWeight: "heavy", fontSize: 12 }}>{data.total}</Text>
          </View>
        </View>

        {settings.footerText && (
          <Text style={styles.footer}>{settings.footerText}</Text>
        )}
      </Page>
    </Document>
  );
}
