"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, FileUp, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { importStatementAction } from "./actions";
import type { CsvMapping } from "./csv-import";
import { FormError } from "@/components/form-error";
import { SelectNative } from "@/components/ui/select-native";

type Parsed = { headers: string[]; rows: string[][] };

function previewCsv(text: string): Parsed {
  const normalized = text.replace(/^\uFEFF/, "");
  const first = normalized.split(/\r?\n/, 1)[0];
  const delimiter = [",", ";", "\t"].map((value) => ({ value, count: first.split(value).length })).sort((a, b) => b.count - a.count)[0].value;
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === '"') { if (quoted && normalized[i + 1] === '"') { field += '"'; i += 1; } else quoted = !quoted; }
    else if (char === delimiter && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && normalized[i + 1] === "\n") i += 1; row.push(field); field = ""; if (row.some((value) => value.trim())) rows.push(row); row = []; }
    else field += char;
  }
  row.push(field); if (row.some((value) => value.trim())) rows.push(row);
  if (quoted || rows.length < 2) throw new Error("The CSV needs a valid header and at least one data row.");
  const headers = rows[0].map((value) => value.trim());
  return { headers, rows: rows.slice(1).map((values) => headers.map((_, index) => values[index]?.trim() ?? "")) };
}

function guess(headers: string[], patterns: RegExp[]) {
  return headers.find((header) => patterns.some((pattern) => pattern.test(header))) ?? "";
}

export function StatementImportWizard({ businessId, accountId, accountName }: { businessId: string; accountId: string; accountName: string }) {
  const [step, setStep] = useState(1); const [fileName, setFileName] = useState(""); const [text, setText] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null); const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ importedCount: number; duplicateCount: number } | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>({ date: "", valueDate: "", description: "", reference: "", amount: "", debit: "", credit: "", externalId: "" });
  const mappedHeaders = useMemo(() => Object.values(mapping).filter(Boolean), [mapping]);
  async function choose(file?: File) {
    setError(""); if (!file) return; if (!/\.csv$/i.test(file.name)) return setError("Choose a .csv statement file.");
    if (file.size > 2 * 1024 * 1024) return setError("CSV files may not exceed 2 MB.");
    try {
      const nextText = await file.text(); const nextParsed = previewCsv(nextText);
      if (nextParsed.rows.length > 5_000) throw new Error("CSV imports are limited to 5,000 rows.");
      setFileName(file.name); setText(nextText); setParsed(nextParsed);
      setMapping({
        date: guess(nextParsed.headers, [/^date$/i, /transaction.*date/i]), valueDate: guess(nextParsed.headers, [/value.*date/i]),
        description: guess(nextParsed.headers, [/description/i, /narration/i, /details/i]), reference: guess(nextParsed.headers, [/reference/i, /^ref$/i]),
        amount: guess(nextParsed.headers, [/^amount$/i, /signed.*amount/i]), debit: guess(nextParsed.headers, [/debit/i, /withdrawal/i]),
        credit: guess(nextParsed.headers, [/credit/i, /deposit/i]), externalId: guess(nextParsed.headers, [/external.*id/i, /transaction.*id/i]),
      }); setStep(2);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The CSV could not be read."); }
  }
  function continueToPreview() {
    setError("");
    if (!mapping.date || !mapping.description || (!mapping.amount && !(mapping.debit && mapping.credit))) {
      return setError("Map Date, Description, and either signed Amount or both Debit and Credit.");
    }
    if (new Set(mappedHeaders).size !== mappedHeaders.length) return setError("Each CSV column can only be mapped once.");
    setStep(3);
  }
  async function runImport() {
    setPending(true); setError("");
    const response = await importStatementAction(businessId, accountId, fileName, text, mapping);
    setPending(false); if (response.error) return setError(response.error);
    setResult({ importedCount: response.importedCount ?? 0, duplicateCount: response.duplicateCount ?? 0 }); setStep(4);
  }
  const labels = ["Upload", "Map Columns", "Preview", "Import"];
  return <div>
    <ol className="mb-7 grid grid-cols-4 gap-2" aria-label="Import progress">{labels.map((label, index) => <li key={label} className={`border-t-2 pt-2 text-xs font-medium ${index + 1 <= step ? "border-primary text-foreground" : "border-border text-muted-foreground"}`}><span className="tabular">{index + 1}.</span> {label}</li>)}</ol>
    {error && <FormError message={error} />}
    {step === 1 && <div className="rounded-lg border border-dashed border-border-strong bg-surface py-12 text-center"><FileUp className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">Upload CSV statement</h2><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">Up to 2 MB and 5,000 rows. Imported lines are review data only and never create journals.</p><label className="mt-5 inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"><input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => choose(event.target.files?.[0])} />Choose CSV</label></div>}
    {step === 2 && parsed && <section><div className="mb-5"><h2 className="text-base font-semibold">Map CSV columns</h2><p className="mt-1 text-sm text-muted-foreground">{fileName} · {parsed.rows.length} rows. Debit is treated as money out; Credit as money in.</p></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{([
      ["date", "Transaction date", true], ["valueDate", "Value date", false], ["description", "Description", true], ["reference", "Reference", false], ["amount", "Signed amount", false], ["debit", "Debit", false], ["credit", "Credit", false], ["externalId", "External ID", false],
    ] as const).map(([key, label, required]) => <div key={key} className="space-y-1.5"><Label htmlFor={key}>{label}{!required && <span className="font-normal text-muted-foreground"> (optional)</span>}</Label><SelectNative id={key}  value={mapping[key]} onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value }))}><option value="">Not mapped</option>{parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</SelectNative></div>)}</div><div className="mt-7 flex justify-between"><Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="size-4" /> Back</Button><Button onClick={continueToPreview}>Preview <ArrowRight className="size-4" /></Button></div></section>}
    {step === 3 && parsed && <section><div className="mb-4"><h2 className="text-base font-semibold">Preview import</h2><p className="mt-1 text-sm text-muted-foreground">First {Math.min(20, parsed.rows.length)} rows for {accountName}. Server validation runs again before import.</p></div><div className="data-panel"><table className="data-table min-w-[820px]"><thead><tr>{parsed.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{parsed.rows.slice(0, 20).map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column} className="max-w-64 truncate">{value || "—"}</td>)}</tr>)}</tbody></table></div><div className="mt-7 flex justify-between"><Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft className="size-4" /> Back</Button><Button onClick={runImport} disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />} Import {parsed.rows.length} lines</Button></div></section>}
    {step === 4 && result && <div className="rounded-lg border border-border bg-surface-raised p-7 text-center"><CheckCircle2 className="mx-auto size-9 text-success" /><h2 className="mt-3 text-lg font-semibold">Statement imported</h2><p className="mt-1 text-sm text-muted-foreground">{result.importedCount} new lines imported. {result.duplicateCount} likely duplicate{result.duplicateCount === 1 ? " was" : "s were"} skipped. No journals were created.</p><Button asChild className="mt-5"><Link href={`/b/${businessId}/banking/accounts/${accountId}?section=imported`}>Review imported lines</Link></Button></div>}
  </div>;
}
