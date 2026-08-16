import { StyleSheet } from "@react-pdf/renderer";

// Shared styles for all templates
export const colors = {
  text: "#202936",
  muted: "#657184",
  border: "#dce2e9",
  borderStrong: "#cbd4df",
  surface: "#f8fafc",
  surfaceMuted: "#edf1f5",
};

export const sharedStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Inter",
    color: colors.text,
    lineHeight: 1.4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 8,
    color: colors.muted,
    fontWeight: 600,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  table: {
    display: "flex",
    width: "100%",
    marginVertical: 10,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    minHeight: 24,
  },
  tableCell: {
    padding: 6,
    fontSize: 9,
  },
  totals: {
    marginTop: 20,
    alignItems: "flex-end",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 200,
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: colors.muted,
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
});
