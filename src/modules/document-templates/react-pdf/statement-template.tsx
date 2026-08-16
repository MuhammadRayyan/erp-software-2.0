import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { classicStyles as styles, colors } from "./primitives";
import type { TemplateSettings } from "../template-settings";

export type StatementTemplateData = {
  companyName: string;
  customerName: string;
  customerAddress?: string;
  customerTrn?: string;
  statementDate: string;
  lines: Array<{
    date: string;
    type: string;
    reference: string;
    description: string;
    debit: string;
    credit: string;
    balance: string;
  }>;
  totalOutstanding: string;
};

export function ClassicStatementDocument({ data, settings }: { data: StatementTemplateData; settings: TemplateSettings }) {
  const primaryColor = settings.primaryColor || colors.text;

  return (
    <Document>
      <Page size="A4" style={[styles.page, { fontFamily: settings.fontName }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {settings.logoUrl && <Image src={settings.logoUrl} style={{ width: 120, height: 40, objectFit: "contain", marginBottom: 10 }} />}
            <Text style={{ fontSize: 14, color: primaryColor, fontWeight: "heavy" }}>{data.companyName}</Text>
            {settings.headerText && <Text style={{ fontSize: 9, color: colors.muted, marginTop: 4 }}>{settings.headerText}</Text>}
          </View>
          <View style={styles.boxedDetails}>
            <Text style={{ fontSize: 18, fontWeight: "heavy", color: primaryColor, marginBottom: 8, textAlign: "center" }}>
              STATEMENT OF ACCOUNT
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 9, fontWeight: "heavy" }}>Date:</Text>
              <Text style={{ fontSize: 9 }}>{data.statementDate}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 9, fontWeight: "heavy" }}>Total Due:</Text>
              <Text style={{ fontSize: 9 }}>{data.totalOutstanding}</Text>
            </View>
          </View>
        </View>

        {/* Bill To */}
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <Text style={{ fontSize: 12, fontWeight: "heavy", marginBottom: 2 }}>{data.customerName}</Text>
          {data.customerAddress && <Text style={{ fontSize: 9, color: colors.text, marginBottom: 2 }}>{data.customerAddress}</Text>}
          {settings.showCustomerTrn && data.customerTrn && (
            <Text style={{ fontSize: 9, color: colors.text }}>TRN: {data.customerTrn}</Text>
          )}
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableCell, { flex: 1.5, fontWeight: "heavy" }]}>Date</Text>
            <Text style={[styles.tableCell, { flex: 1.5, fontWeight: "heavy" }]}>Type</Text>
            <Text style={[styles.tableCell, { flex: 2, fontWeight: "heavy" }]}>Reference</Text>
            <Text style={[styles.tableCell, { flex: 3, fontWeight: "heavy" }]}>Description</Text>
            <Text style={[styles.tableCell, { flex: 1.5, textAlign: "right", fontWeight: "heavy" }]}>Debit</Text>
            <Text style={[styles.tableCell, { flex: 1.5, textAlign: "right", fontWeight: "heavy" }]}>Credit</Text>
            <Text style={[styles.tableCell, { flex: 2, textAlign: "right", fontWeight: "heavy" }]}>Balance</Text>
          </View>
          {data.lines.length === 0 && (
            <View style={[styles.tableRow, { justifyContent: "center" }]}>
              <Text style={[styles.tableCell, { color: colors.muted }]}>No posted activity</Text>
            </View>
          )}
          {data.lines.map((line, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={[styles.tableCell, { flex: 1.5 }]}>{line.date}</Text>
              <Text style={[styles.tableCell, { flex: 1.5 }]}>{line.type}</Text>
              <Text style={[styles.tableCell, { flex: 2 }]}>{line.reference}</Text>
              <Text style={[styles.tableCell, { flex: 3 }]}>{line.description}</Text>
              <Text style={[styles.tableCell, { flex: 1.5, textAlign: "right" }]}>{line.debit}</Text>
              <Text style={[styles.tableCell, { flex: 1.5, textAlign: "right" }]}>{line.credit}</Text>
              <Text style={[styles.tableCell, { flex: 2, textAlign: "right" }]}>{line.balance}</Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        {settings.footerText && (
          <Text style={styles.footer}>{settings.footerText}</Text>
        )}
      </Page>
    </Document>
  );
}
