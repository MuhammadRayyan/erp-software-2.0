import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { classicStyles as styles, colors } from "./primitives";
import type { TemplateSettings } from "../template-settings";

export type StatementTemplateData = {
  companyName: string;
  customerName?: string;
  partyName?: string;
  partyLabel?: string;
  title?: string;
  balanceLabel?: string;
  customerAddress?: string;
  customerTrn?: string;
  partyAddress?: string;
  partyTrn?: string;
  statementDate: string;
  fromDate?: string;
  toDate?: string;
  periodLabel?: string;
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
  aging?: {
    current: string;
    days30: string;
    days60: string;
    days90: string;
    days90Plus: string;
    total: string;
  };
};

export function ClassicStatementDocument({ data, settings }: { data: StatementTemplateData; settings: TemplateSettings }) {
  const primaryColor = settings.primaryColor || colors.text;
  const partyTitle = data.partyLabel || "Customer";
  const name = data.partyName || data.customerName || "";
  const address = data.partyAddress || data.customerAddress;
  const trn = data.partyTrn || data.customerTrn;
  const docTitle = data.title || "STATEMENT OF ACCOUNT";
  const balLabel = data.balanceLabel || "Total Due:";

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
              {docTitle}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ fontSize: 9, fontWeight: "heavy" }}>Date:</Text>
              <Text style={{ fontSize: 9 }}>{data.statementDate}</Text>
            </View>
            {data.periodLabel && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 9, fontWeight: "heavy" }}>Period:</Text>
                <Text style={{ fontSize: 9 }}>{data.periodLabel}</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 9, fontWeight: "heavy" }}>{balLabel}</Text>
              <Text style={{ fontSize: 9 }}>{data.totalOutstanding}</Text>
            </View>
          </View>
        </View>

        {/* Party Details */}
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>{partyTitle}</Text>
          <Text style={{ fontSize: 12, fontWeight: "heavy", marginBottom: 2 }}>{name}</Text>
          {address && <Text style={{ fontSize: 9, color: colors.text, marginBottom: 2 }}>{address}</Text>}
          {settings.showCustomerTrn && trn && (
            <Text style={{ fontSize: 9, color: colors.text }}>TRN: {trn}</Text>
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

        {/* Aging Summary Analysis */}
        {data.aging && (
          <View style={{ marginTop: 16, marginBottom: 10, border: `1 solid ${colors.border}`, borderRadius: 4, padding: 8 }} wrap={false}>
            <Text style={{ fontSize: 9, fontWeight: "heavy", color: primaryColor, marginBottom: 6 }}>Aging Analysis</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 7.5, color: colors.muted }}>Current</Text>
                <Text style={{ fontSize: 8.5, fontWeight: "heavy", marginTop: 2 }}>{data.aging.current}</Text>
              </View>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 7.5, color: colors.muted }}>1–30 Days</Text>
                <Text style={{ fontSize: 8.5, fontWeight: "heavy", marginTop: 2 }}>{data.aging.days30}</Text>
              </View>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 7.5, color: colors.muted }}>31–60 Days</Text>
                <Text style={{ fontSize: 8.5, fontWeight: "heavy", marginTop: 2 }}>{data.aging.days60}</Text>
              </View>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 7.5, color: colors.muted }}>61–90 Days</Text>
                <Text style={{ fontSize: 8.5, fontWeight: "heavy", marginTop: 2 }}>{data.aging.days90}</Text>
              </View>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 7.5, color: colors.muted }}>90+ Days</Text>
                <Text style={{ fontSize: 8.5, fontWeight: "heavy", marginTop: 2 }}>{data.aging.days90Plus}</Text>
              </View>
              <View style={{ flex: 1.2, alignItems: "center", borderLeft: `1 solid ${colors.border}`, paddingLeft: 4 }}>
                <Text style={{ fontSize: 7.5, color: colors.muted }}>Total</Text>
                <Text style={{ fontSize: 8.5, fontWeight: "heavy", marginTop: 2, color: primaryColor }}>{data.aging.total}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Footer */}
        {settings.footerText && (
          <Text style={styles.footer}>{settings.footerText}</Text>
        )}
      </Page>
    </Document>
  );
}
