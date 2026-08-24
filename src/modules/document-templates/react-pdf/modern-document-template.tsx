import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { sharedStyles, colors } from "./primitives";
import type { TemplateSettings } from "../template-settings";

export interface DocumentTemplateData {
  companyName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerName: string;
  customerAddress?: string;
  customerTrn?: string;
  lines: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
  }>;
  subtotal: string;
  tax: string;
  total: string;
  foreignDetail?: string;
  customFields?: Array<{ name: string; value: string }>;
}

export type DocumentTemplateVariant = {
  title: string;
  partyLabel: string;
  showDueDate: boolean;
  showBuyerTrn: boolean;
  totalLabel: string;
  showTax: boolean;
};

const styles = StyleSheet.create({
  ...sharedStyles,
  logo: { width: 120, height: 40, objectFit: "contain" },
  invoiceTitle: { fontSize: 24, fontWeight: "heavy" },
  customerName: { fontSize: 12, fontWeight: "heavy" },
});

export function ModernDocumentTemplate({ data, settings, variant }: { data: DocumentTemplateData; settings: TemplateSettings; variant: DocumentTemplateVariant }) {
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
            <Text style={[styles.invoiceTitle, { color: primaryColor }]}>{variant.title}</Text>
            <Text style={{ marginTop: 4 }}>{data.invoiceNumber}</Text>
            <Text style={{ fontSize: 9, color: colors.muted }}>{data.invoiceDate}</Text>
            {variant.showDueDate && <Text style={{ fontSize: 9, color: colors.muted }}>{data.dueDate}</Text>}
          </View>
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>{variant.partyLabel}</Text>
          <Text style={styles.customerName}>{data.customerName}</Text>
          {data.customerAddress && <Text style={{ fontSize: 9, color: colors.muted }}>{data.customerAddress}</Text>}
          {variant.showBuyerTrn && settings.showCustomerTrn && data.customerTrn && (
            <Text style={{ fontSize: 9, color: colors.muted }}>TRN: {data.customerTrn}</Text>
          )}
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
          {variant.showTax && settings.showTaxColumn && (
            <View style={styles.totalsRow}>
              <Text style={{ color: colors.muted }}>VAT</Text>
              <Text>{data.tax}</Text>
            </View>
          )}
          <View style={[styles.totalsRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4, marginTop: 4 }]}>
            <Text style={{ fontWeight: "heavy", fontSize: 12 }}>{variant.totalLabel}</Text>
            <Text style={{ fontWeight: "heavy", fontSize: 12 }}>{data.total}</Text>
          </View>
          {data.foreignDetail && (
            <Text style={{ fontSize: 8, color: colors.muted, marginTop: 8, textAlign: "right" }}>
              {data.foreignDetail}
            </Text>
          )}
        </View>

        {settings.showCustomFields && data.customFields && data.customFields.length > 0 && (
          <View style={{ marginTop: 20, padding: 8, backgroundColor: colors.surface, borderRadius: 4 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>Additional Information</Text>
            {data.customFields.map((field) => (
              <View key={field.name} style={{ flexDirection: "row", marginBottom: 2 }}>
                <Text style={{ flex: 1, fontSize: 9, color: colors.muted }}>{field.name}</Text>
                <Text style={{ flex: 2, fontSize: 9, color: colors.text }}>{field.value}</Text>
              </View>
            ))}
          </View>
        )}

        {settings.footerText && (
          <Text style={styles.footer}>{settings.footerText}</Text>
        )}
      </Page>
    </Document>
  );
}
