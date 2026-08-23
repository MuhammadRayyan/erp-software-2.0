import { PINT_AE_CUSTOMIZATION_ID, PINT_AE_PROFILE_ID } from "@/modules/einvoicing/einvoice-types";
import type {
  CanonicalInboundEInvoice,
  CanonicalInboundLine,
  InboundDocumentType,
  InboundParty,
  ValidationIssue,
} from "./inbound-types";

export const MAX_INBOUND_XML_BYTES = 2 * 1024 * 1024;

const ROOT_NAMESPACES = {
  invoice: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  credit_note: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
} as const;

function decodeXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

function elementPattern(localName: string, global = false) {
  const flags = global ? "gi" : "i";
  return new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b([^>]*)>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${localName}\\s*>`,
    flags,
  );
}

function firstElement(xml: string, localName: string) {
  const match = elementPattern(localName).exec(xml);
  return match ? { attributes: match[1] ?? "", inner: match[2] ?? "", full: match[0] } : null;
}

function allElements(xml: string, localName: string) {
  return [...xml.matchAll(elementPattern(localName, true))].map((match) => ({
    attributes: match[1] ?? "",
    inner: match[2] ?? "",
    full: match[0],
  }));
}

function value(xml: string, localName: string) {
  const element = firstElement(xml, localName);
  return element ? decodeXmlText(element.inner) : "";
}

function attribute(attributes: string, name: string) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ? decodeXmlText(match[2]) : "";
}

function required(
  current: string,
  ruleId: string,
  message: string,
  issues: ValidationIssue[],
) {
  if (!current) issues.push({ layer: "parsing", ruleId, message });
  return current;
}

function decimalToScaled(
  input: string,
  scale: number,
  ruleId: string,
  label: string,
  issues: ValidationIssue[],
) {
  const normalized = input.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    issues.push({ layer: "parsing", ruleId, message: `${label} is not a valid decimal value.` });
    return 0;
  }
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const precision = Math.log10(scale);
  const significantFraction = fraction.replace(/0+$/, "");
  if (significantFraction.length > precision) {
    issues.push({
      layer: "mapping",
      ruleId,
      message: `${label} has more precision than the ERP ${precision}-decimal scale supports.`,
    });
    return 0;
  }
  const result = Number(whole) * scale + Number(fraction.slice(0, precision).padEnd(precision, "0"));
  if (!Number.isSafeInteger(result)) {
    issues.push({ layer: "mapping", ruleId, message: `${label} is outside the supported numeric range.` });
    return 0;
  }
  return negative ? -result : result;
}

function money(
  xml: string,
  localName: string,
  ruleId: string,
  label: string,
  issues: ValidationIssue[],
  requiredValue = true,
) {
  const raw = value(xml, localName);
  if (!raw && !requiredValue) return 0;
  required(raw, ruleId, `${label} is required.`, issues);
  return decimalToScaled(raw || "0", 100, ruleId, label, issues);
}

function percentBasisPoints(raw: string, issues: ValidationIssue[]) {
  return decimalToScaled(raw || "0", 100, "TAX-RATE", "VAT percentage", issues);
}

function parseParty(xml: string, wrapper: string, role: "supplier" | "buyer", issues: ValidationIssue[]): InboundParty {
  const block = firstElement(xml, wrapper)?.inner ?? "";
  if (!block) {
    issues.push({ layer: "parsing", ruleId: `${role.toUpperCase()}-PARTY`, message: `Accounting ${role} party is required.` });
  }
  const endpoint = firstElement(block, "EndpointID");
  const legal = firstElement(block, "PartyLegalEntity")?.inner ?? "";
  const tax = firstElement(block, "PartyTaxScheme")?.inner ?? "";
  const address = firstElement(block, "PostalAddress")?.inner ?? "";
  const legalName = required(
    value(legal, "RegistrationName") || value(block, "Name"),
    `${role.toUpperCase()}-LEGAL-NAME`,
    `${role === "supplier" ? "Supplier" : "Buyer"} legal name is required.`,
    issues,
  );
  return {
    legalName,
    trn: value(tax, "CompanyID") || null,
    legalRegistrationIdentifier: value(legal, "CompanyID") || null,
    endpointIdentifier: endpoint ? decodeXmlText(endpoint.inner) || null : null,
    endpointScheme: endpoint ? attribute(endpoint.attributes, "schemeID") || null : null,
    addressLine1: value(address, "StreetName") || value(address, "AddressLine") || null,
    city: value(address, "CityName") || null,
    countrySubdivision: value(address, "CountrySubentity") || null,
    countryCode: value(firstElement(address, "Country")?.inner ?? "", "IdentificationCode") || null,
  };
}

function parseLine(block: string, position: number, documentType: InboundDocumentType, issues: ValidationIssue[]): CanonicalInboundLine | null {
  const quantityName = documentType === "invoice" ? "InvoicedQuantity" : "CreditedQuantity";
  const quantityElement = firstElement(block, quantityName);
  const quantityMicros = decimalToScaled(
    quantityElement ? decodeXmlText(quantityElement.inner) : "",
    10_000,
    "LINE-QUANTITY",
    `Line ${position + 1} quantity`,
    issues,
  );
  const sourceLineId = required(value(block, "ID"), "LINE-ID", `Line ${position + 1} identifier is required.`, issues);
  const item = firstElement(block, "Item")?.inner ?? "";
  const tax = firstElement(item, "ClassifiedTaxCategory")?.inner ?? "";
  const price = firstElement(block, "Price")?.inner ?? "";
  const netAmountMinor = money(block, "LineExtensionAmount", "LINE-NET", `Line ${position + 1} net amount`, issues);
  const taxRateBasisPoints = percentBasisPoints(value(tax, "Percent"), issues);
  const itemPriceExtension = firstElement(block, "ItemPriceExtension")?.inner ?? "";
  const explicitLineTax = firstElement(itemPriceExtension, "TaxTotal")?.inner ?? "";
  const taxAmountMinor = explicitLineTax
    ? money(explicitLineTax, "TaxAmount", "LINE-TAX", `Line ${position + 1} VAT amount`, issues)
    : Math.round((netAmountMinor * taxRateBasisPoints) / 10_000);
  if (quantityMicros <= 0) {
    issues.push({ layer: "parsing", ruleId: "LINE-QUANTITY", message: `Line ${position + 1} quantity must be positive.` });
    return null;
  }
  if (netAmountMinor < 0 || taxAmountMinor < 0 || taxRateBasisPoints < 0) {
    issues.push({ layer: "parsing", ruleId: "LINE-AMOUNT", message: `Line ${position + 1} contains a negative amount or VAT rate.` });
    return null;
  }
  const orderLine = firstElement(block, "OrderLineReference")?.inner ?? "";
  const supplierItem = firstElement(item, "SellersItemIdentification")?.inner ?? "";
  const buyerItem = firstElement(item, "BuyersItemIdentification")?.inner ?? "";
  return {
    sourceLineId,
    orderLineReference: value(orderLine, "LineID") || value(orderLine, "ID") || null,
    supplierItemIdentifier: value(supplierItem, "ID") || null,
    erpItemIdentifier: value(buyerItem, "ID") || null,
    description: value(item, "Description") || value(item, "Name") || `Line ${position + 1}`,
    itemName: value(item, "Name") || null,
    quantityMicros,
    unitCode: quantityElement ? attribute(quantityElement.attributes, "unitCode") || "C62" : "C62",
    unitPriceMinor: money(price, "PriceAmount", "LINE-PRICE", `Line ${position + 1} unit price`, issues),
    netAmountMinor,
    taxAmountMinor,
    grossAmountMinor: netAmountMinor + taxAmountMinor,
    taxCategory: required(value(tax, "ID"), "LINE-TAX-CATEGORY", `Line ${position + 1} VAT category is required.`, issues),
    taxRateBasisPoints,
  };
}

export function assertSafeInboundXml(xml: string): InboundDocumentType {
  if (!xml.trim()) throw new Error("Inbound eInvoice XML is empty.");
  if (Buffer.byteLength(xml, "utf8") > MAX_INBOUND_XML_BYTES) {
    throw new Error(`Inbound eInvoice XML exceeds the ${MAX_INBOUND_XML_BYTES}-byte limit.`);
  }
  if (/\0|[\u0001-\u0008\u000B\u000C\u000E-\u001F]/.test(xml)) {
    throw new Error("Inbound eInvoice XML contains unsupported control characters.");
  }
  const declaration = xml.match(/^\uFEFF?\s*<\?xml\b([^?]*)\?>/i)?.[1] ?? "";
  const encoding = declaration.match(/encoding\s*=\s*(["'])(.*?)\1/i)?.[2]?.toLowerCase();
  if (encoding && !["utf-8", "utf8"].includes(encoding)) {
    throw new Error("Inbound eInvoices must declare UTF-8 encoding.");
  }
  if (/<!DOCTYPE\b|<!ENTITY\b|\bSYSTEM\s+["']|\bPUBLIC\s+["']|<\s*(?:[\w.-]+:)?include\b/i.test(xml)) {
    throw new Error("Inbound eInvoice XML contains a prohibited DTD, entity, or external include.");
  }
  const withoutDeclaration = xml.replace(/^\uFEFF?\s*<\?xml\b[^?]*\?>/i, "").trimStart();
  if (/<\?/.test(withoutDeclaration)) {
    throw new Error("Inbound eInvoice XML processing instructions are not supported.");
  }
  const root = withoutDeclaration.match(/^<(?:(?<prefix>[A-Za-z_][\w.-]*):)?(?<name>Invoice|CreditNote)\b(?<attributes>[^>]*)>/i);
  if (!root?.groups) throw new Error("Inbound XML root must be a UBL Invoice or CreditNote.");
  const documentType: InboundDocumentType = root.groups.name.toLowerCase() === "invoice" ? "invoice" : "credit_note";
  const namespaceAttribute = root.groups.prefix ? `xmlns:${root.groups.prefix}` : "xmlns";
  const namespace = attribute(root.groups.attributes, namespaceAttribute);
  if (namespace !== ROOT_NAMESPACES[documentType]) {
    throw new Error(`Inbound ${root.groups.name} uses an unsupported UBL namespace.`);
  }
  return documentType;
}

export function parseInboundPintAeXml(
  xml: string,
  specificationVersion: string,
): { canonical: CanonicalInboundEInvoice; issues: ValidationIssue[] } {
  const documentType = assertSafeInboundXml(xml);
  const issues: ValidationIssue[] = [];
  const customizationId = required(value(xml, "CustomizationID"), "CUSTOMIZATION-ID", "PINT-AE CustomizationID is required.", issues);
  if (customizationId && customizationId !== PINT_AE_CUSTOMIZATION_ID) {
    issues.push({ layer: "parsing", ruleId: "CUSTOMIZATION-ID", message: `Unsupported PINT-AE customization ${customizationId}.` });
  }
  const profileId = required(value(xml, "ProfileID"), "PROFILE-ID", "PINT billing ProfileID is required.", issues);
  if (profileId && profileId !== PINT_AE_PROFILE_ID) {
    issues.push({ layer: "parsing", ruleId: "PROFILE-ID", message: `Unsupported PINT profile ${profileId}.` });
  }
  const legalTotal = firstElement(xml, "LegalMonetaryTotal")?.inner ?? "";
  const taxTotal = firstElement(xml, "TaxTotal")?.inner ?? "";
  const lineName = documentType === "invoice" ? "InvoiceLine" : "CreditNoteLine";
  const lines = allElements(xml, lineName)
    .map((entry, position) => parseLine(entry.inner, position, documentType, issues))
    .filter((line): line is CanonicalInboundLine => Boolean(line));
  if (!lines.length) issues.push({ layer: "parsing", ruleId: "INVOICE-LINES", message: "At least one valid invoice line is required." });
  const subtotalMinor = money(legalTotal, "LineExtensionAmount", "TOTAL-NET", "Line extension total", issues);
  const allowanceTotalMinor = money(legalTotal, "AllowanceTotalAmount", "TOTAL-ALLOWANCE", "Allowance total", issues, false);
  const chargeTotalMinor = money(legalTotal, "ChargeTotalAmount", "TOTAL-CHARGE", "Charge total", issues, false);
  const taxMinor = money(taxTotal, "TaxAmount", "TOTAL-TAX", "VAT total", issues);
  const totalMinor = money(legalTotal, "TaxInclusiveAmount", "TOTAL-GROSS", "Tax-inclusive total", issues);
  const amountDueMinor = money(legalTotal, "PayableAmount", "TOTAL-DUE", "Amount due", issues);
  const lineNet = lines.reduce((sum, line) => sum + line.netAmountMinor, 0);
  const lineTax = lines.reduce((sum, line) => sum + line.taxAmountMinor, 0);
  if (lineNet !== subtotalMinor) issues.push({ layer: "parsing", ruleId: "TOTAL-NET-MISMATCH", message: "Invoice line net amounts do not equal the declared line extension total." });
  if (lineTax !== taxMinor) issues.push({ layer: "parsing", ruleId: "TOTAL-TAX-MISMATCH", message: "Invoice line VAT amounts do not equal the declared VAT total." });
  if (subtotalMinor - allowanceTotalMinor + chargeTotalMinor + taxMinor !== totalMinor) {
    issues.push({ layer: "parsing", ruleId: "TOTAL-GROSS-MISMATCH", message: "Declared monetary totals do not reconcile." });
  }
  const orderReference = firstElement(xml, "OrderReference")?.inner ?? "";
  const despatchReference = firstElement(xml, "DespatchDocumentReference")?.inner ?? "";
  const billingReference = firstElement(xml, "BillingReference")?.inner ?? "";
  const canonical: CanonicalInboundEInvoice = {
    specificationVersion,
    customizationId,
    profileId,
    documentType,
    documentUuid: required(value(xml, "UUID"), "DOCUMENT-UUID", "Document UUID is required.", issues),
    documentNumber: required(value(xml, "ID"), "DOCUMENT-NUMBER", "Supplier document number is required.", issues),
    issueDate: required(value(xml, "IssueDate"), "ISSUE-DATE", "Issue date is required.", issues),
    taxDate: value(xml, "TaxPointDate") || null,
    dueDate: value(xml, "DueDate") || null,
    currencyCode: required(value(xml, "DocumentCurrencyCode"), "CURRENCY", "Document currency is required.", issues),
    orderReference: value(orderReference, "ID") || null,
    despatchReference: value(despatchReference, "ID") || null,
    sourceInvoiceReference: value(firstElement(billingReference, "InvoiceDocumentReference")?.inner ?? "", "ID") || null,
    supplier: parseParty(xml, "AccountingSupplierParty", "supplier", issues),
    buyer: parseParty(xml, "AccountingCustomerParty", "buyer", issues),
    lines,
    subtotalMinor,
    allowanceTotalMinor,
    chargeTotalMinor,
    taxMinor,
    totalMinor,
    amountDueMinor,
  };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(canonical.documentUuid)) {
    issues.push({ layer: "parsing", ruleId: "DOCUMENT-UUID", message: "Document UUID is not a valid RFC 4122 UUID." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(canonical.issueDate)) {
    issues.push({ layer: "parsing", ruleId: "ISSUE-DATE", message: "Issue date must use YYYY-MM-DD." });
  }
  return { canonical, issues };
}
