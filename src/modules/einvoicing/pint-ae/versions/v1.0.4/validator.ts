import { join } from "node:path";
import SaxonJS from "saxon-js";
import type { EInvoiceValidationIssue } from "@/modules/einvoicing/einvoice-types";

type SaxonResult = { principalResult?: string };

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function attribute(block: string, name: string) {
  const match = block.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : "";
}

function parseFailedAssertions(svrl: string, layer: "pint-ubl" | "pint-ae") {
  const issues: EInvoiceValidationIssue[] = [];
  for (const match of svrl.matchAll(/<svrl:failed-assert\b[\s\S]*?<\/svrl:failed-assert>/g)) {
    const block = match[0];
    const textMatch = block.match(/<svrl:text>([\s\S]*?)<\/svrl:text>/);
    issues.push({
      layer,
      ruleId: attribute(block, "id") || "SCHEMATRON",
      message: decodeXml((textMatch?.[1] ?? "PINT-AE validation failed.").replace(/<[^>]+>/g, "").trim()),
      path: attribute(block, "location") || undefined,
    });
  }
  return issues;
}

function run(stylesheet: "pint-ubl.sef.json" | "pint-ae.sef.json", xml: string) {
  const stylesheetFileName = join(
    process.cwd(),
    "src",
    "modules",
    "einvoicing",
    "pint-ae",
    "versions",
    "v1.0.4",
    "validation",
    stylesheet,
  );
  const result = SaxonJS.transform({
    stylesheetFileName,
    sourceText: xml,
    destination: "serialized",
  }, "sync") as SaxonResult;
  if (!result.principalResult) throw new Error(`Official validator ${stylesheet} returned no SVRL result.`);
  return result.principalResult;
}

export function validatePintAe104(xml: string) {
  const generalSvrl = run("pint-ubl.sef.json", xml);
  const aeSvrl = run("pint-ae.sef.json", xml);
  const pintUblIssues = parseFailedAssertions(generalSvrl, "pint-ubl");
  const pintAeIssues = parseFailedAssertions(aeSvrl, "pint-ae");
  return {
    valid: pintUblIssues.length === 0 && pintAeIssues.length === 0,
    pintUblIssues,
    pintAeIssues,
  };
}
