import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { classicStyles as styles, colors } from "./primitives";
import type { TemplateSettings } from "../template-settings";
import type { InvoiceTemplateData } from "./invoice-template";

export function ClassicReceiptDocument({ data, settings }: { data: InvoiceTemplateData; settings: TemplateSettings }) {
  const primaryColor = settings.primaryColor || colors.text;

  return (
    <Document>
      <Page size="A4" style={[styles.page, { fontFamily: settings.fontName }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {settings.logoUrl && <Image src={settings.logoUrl} style={{ width: 120, height: 40, objectFit: "contain", marginBottom: 10 }} />}
            <Text style={{ fontSize: 14, color: primaryColor, fontWeight: "heavy" }}>{data.companyName}</Text>
            {settings.headerText && <Text style={{ fontSize: 9, color: colors.muted, marginTop: 4 }}>{settings.headerText}</Text>}
          </View>
          <View style={styles.boxedDetails}>
            <Text style={{ fontSize: 18, fontWeight: "heavy", color: primaryColor, marginBottom: 8, textAlign: "center" }}>
              {data.invoiceTitle || "RECEIPT"}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 9, fontWeight: "heavy" }}>Receipt No:</Text>
              <Text style={{ fontSize: 9 }}>{data.invoiceNumber}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 9, fontWeight: "heavy" }}>Date:</Text>
              <Text style={{ fontSize: 9 }}>{data.invoiceDate.replace("Date: ", "").replace("Invoice date: ", "")}</Text>
            </View>
          </View>
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>{data.customerLabel || "Received From"}</Text>
          <Text style={{ fontSize: 12, fontWeight: "heavy", marginBottom: 2 }}>{data.customerName}</Text>
          {data.customerAddress && <Text style={{ fontSize: 9, color: colors.text, marginBottom: 2 }}>{data.customerAddress}</Text>}
          {settings.showCustomerTrn && data.customerTrn && (
            <Text style={{ fontSize: 9, color: colors.text }}>TRN: {data.customerTrn}</Text>
          )}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableCell, { flex: 3, fontWeight: "heavy" }]}>Description</Text>
            <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>Amount</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={[styles.tableCell, { flex: 3 }]}>{line.description}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{line.amount}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={[styles.boxedDetails, { minWidth: 250, padding: 0 }]}>
            <View style={[styles.totalsRow, { paddingHorizontal: 10, paddingVertical: 10, width: "100%", borderBottomWidth: 0 }]}>
              <Text style={{ fontWeight: "heavy", fontSize: 12 }}>Total Received</Text>
              <Text style={{ fontWeight: "heavy", fontSize: 12 }}>{data.total}</Text>
            </View>
          </View>
          {data.foreignDetail && (
            <Text style={{ fontSize: 8, color: colors.muted, marginTop: 8, textAlign: "right" }}>
              {data.foreignDetail}
            </Text>
          )}
        </View>

        {settings.footerText && (
          <Text style={styles.footer}>{settings.footerText}</Text>
        )}
      </Page>
    </Document>
  );
}
