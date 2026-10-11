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

export const classicStyles = StyleSheet.create({
  page: sharedStyles.page,
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: colors.borderStrong,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 9,
    color: colors.text,
    fontWeight: "heavy",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  table: {
    display: "flex",
    width: "100%",
    marginVertical: 15,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: colors.borderStrong,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
  },
  tableRow: {
    flexDirection: "row",
    minHeight: 24,
  },
  tableCell: {
    padding: 6,
    fontSize: 9,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.borderStrong,
  },
  totals: {
    marginTop: 10,
    alignItems: "flex-end",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 250,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  footer: sharedStyles.footer,
  boxedDetails: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 10,
    backgroundColor: colors.surface,
    minWidth: 180,
  }
});

export const minimalStyles = StyleSheet.create({
  page: {
    padding: 44,
    fontSize: 9,
    fontFamily: "Inter",
    color: "#18181b",
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e4e4e7",
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 7.5,
    color: "#71717a",
    fontWeight: "heavy",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  table: {
    display: "flex",
    width: "100%",
    marginVertical: 14,
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#18181b",
    paddingBottom: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#f4f4f5",
    paddingVertical: 6,
  },
  tableCell: {
    fontSize: 8.5,
    paddingHorizontal: 4,
  },
  totals: {
    marginTop: 18,
    alignItems: "flex-end",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 220,
    paddingVertical: 3,
  },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 44,
    right: 44,
    fontSize: 7.5,
    color: "#a1a1aa",
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: "#f4f4f5",
    paddingTop: 8,
  },
  pageNumber: {
    position: "absolute",
    bottom: 12,
    right: 44,
    fontSize: 7.5,
    color: "#a1a1aa",
  },
});

export function getLogoDimensions(size: "small" | "medium" | "large" = "medium") {
  switch (size) {
    case "small":
      return { width: 90, height: 32 };
    case "large":
      return { width: 160, height: 58 };
    case "medium":
    default:
      return { width: 125, height: 44 };
  }
}

export function getFontScale(size: "small" | "normal" | "large" = "normal") {
  switch (size) {
    case "small":
      return { body: 8, title: 20, table: 7.5, subtext: 7, gap: 12 };
    case "large":
      return { body: 11, title: 26, table: 9.5, subtext: 8.5, gap: 24 };
    case "normal":
    default:
      return { body: 9.5, title: 22, table: 8.5, subtext: 8, gap: 18 };
  }
}
