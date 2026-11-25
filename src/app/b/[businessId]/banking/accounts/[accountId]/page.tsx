import Link from "next/link";
import { ArrowRightLeft, FileUp, Pencil, Plus, Scale } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NoticeToast } from "@/components/notice-toast";
import { formatDate, formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { journalSourceHref, journalSourceLabel } from "@/modules/accounting/journal-source";
import { getBankAccount } from "@/modules/banking/bank-account-service";
import {
  BankAccountImportedTable,
  BankAccountTransactionsTable,
  type SerializedBankHistoryRow,
  type SerializedStatementLine,
} from "@/modules/banking/bank-account-section-tables";
import { getBankTransactionHistory } from "@/modules/banking/banking-report-service";
import { suggestMatches } from "@/modules/banking/matching-service";
import { getSourceHref } from "@/modules/banking/matching-types";
import { listReconciliations } from "@/modules/banking/reconciliation-service";
import { listStatementImports, listStatementLines } from "@/modules/banking/statement-service";
import { listBankRules, findMatchingBankRule } from "@/modules/banking/bank-rule-service";
import { BatchAutoCategorizeButton } from "@/modules/banking/batch-auto-categorize-button";
import { Breadcrumbs } from "@/components/breadcrumbs";

const sections = ["transactions", "imported", "reconciliation", "details"] as const;
type Section = (typeof sections)[number];

export default async function BankAccountViewPage({ params, searchParams }: {
  params: Promise<{ businessId: string; accountId: string }>;
  searchParams: Promise<{ section?: string; notice?: string }>;
}) {
  const { businessId, accountId } = await params; const query = await searchParams;
  const { user, access } = await requireModule(businessId, "banking");
  const account = getBankAccount(businessId, user.id, accountId); if (!account) notFound();
  const visibleSections = account.is_cash_account ? (["transactions", "details"] as const) : sections;
  const section: Section = (visibleSections as readonly string[]).includes(query.section as string) ? (query.section as Section) : "transactions";
  const history = section === "transactions" ? getBankTransactionHistory(businessId, user.id, accountId) : [];
  const serializedHistory: SerializedBankHistoryRow[] = history.map((row) => ({
    ...row,
    sourceLabel: journalSourceLabel(row.source_type),
    sourceHref: journalSourceHref(businessId, row.source_type, row.source_id),
  }));
  const statementLines = section === "imported" ? listStatementLines(businessId, user.id, accountId) : [];
  const imports = section === "imported" ? listStatementImports(businessId, user.id, accountId) : [];
  const serializedLines: SerializedStatementLine[] = statementLines.map((line) => {
    const matchedRule: { id: string; name: string } | null = null;
    let candidates: SerializedStatementLine["candidates"] = [];
    if (line.match_status === "unmatched") {
      candidates = suggestMatches(businessId, user.id, line.id);
    }
    return {
      id: line.id,
      transaction_date: line.transaction_date,
      description: line.description,
      reference: line.reference,
      amount_minor: line.amount_minor,
      match_status: line.match_status,
      reconciled: line.reconciled,
      sourceHref:
        line.matched_source_type && line.matched_source_id
          ? getSourceHref(businessId, line.matched_source_type, line.matched_source_id)
          : null,
      candidates,
      matchedRule,
    };
  });
  const bankRules = section === "imported" ? listBankRules(businessId, user.id, accountId).filter((r) => r.is_active) : [];
  let matchedRuleCount = 0;
  if (section === "imported") {
    for (let i = 0; i < statementLines.length; i += 1) {
      const line = statementLines[i];
      if (line.match_status === "unmatched") {
        const matched = findMatchingBankRule(bankRules, line);
        if (matched) {
          serializedLines[i].matchedRule = { id: matched.id, name: matched.name };
          matchedRuleCount += 1;
        }
      }
    }
  }
  const reconciliations = section === "reconciliation" ? listReconciliations(businessId, user.id, accountId) : [];
  return <div className="page-container"><NoticeToast message={query.notice} />
    <Breadcrumbs
      businessId={businessId}
      items={[
        { label: "Bank Accounts", href: `/b/${businessId}/banking/accounts` },
        { label: account.name },
      ]}
    />
    <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><div className="flex items-center gap-2"><h1 className="page-title">{account.name}</h1><Badge tone={account.is_cash_account ? "neutral" : "info"}>{account.is_cash_account ? "Cash" : "Bank"}</Badge>{!account.is_active && <Badge tone="neutral">Inactive</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{account.account_code ? `${account.account_code} · ` : ""}{account.bank_name || account.ledger_name}{account.account_number_masked ? ` · ${account.account_number_masked}` : ""}</p></div><div className="flex flex-wrap gap-2">{!account.is_cash_account && <Button permission="create" asChild variant="secondary"><Link href={`/b/${businessId}/banking/accounts/${accountId}/import`}><FileUp className="size-4" /> Import Statement</Link></Button>}<Button permission="create" asChild><Link href={`/b/${businessId}/banking/transactions/new?accountId=${accountId}`}><Plus className="size-4" /> New Transaction</Link></Button><Button permission="create" asChild variant="secondary"><Link href={`/b/${businessId}/banking/transfers/new?fromAccountId=${accountId}`}><ArrowRightLeft className="size-4" /> Transfer</Link></Button>{!account.is_cash_account && <Button permission="create" asChild variant="secondary"><Link href={`/b/${businessId}/banking/accounts/${accountId}/reconcile`}><Scale className="size-4" /> Reconcile</Link></Button>}<Button permission="edit" asChild variant="secondary"><Link href={`/b/${businessId}/banking/accounts/${accountId}/edit`}><Pencil className="size-4" /> Edit</Link></Button></div></div>
    <div className={`mb-6 grid gap-px overflow-hidden rounded-lg border border-border bg-border ${account.is_cash_account ? "sm:grid-cols-1" : "sm:grid-cols-3"}`}><div className="bg-surface-raised px-4 py-3"><p className="text-xs text-muted-foreground">Book Balance</p><p className="money mt-1 text-lg font-semibold">{formatMoney(account.book_balance_minor, access.business.currency)}</p><p className="mt-1 text-xs text-muted-foreground">Mapped GL</p></div>{!account.is_cash_account && <><div className="bg-surface-raised px-4 py-3"><p className="text-xs text-muted-foreground">Statement Balance</p><p className="money mt-1 text-lg font-semibold">{account.statement_balance_minor === null ? "Not reconciled" : formatMoney(account.statement_balance_minor, access.business.currency)}</p><p className="mt-1 text-xs text-muted-foreground">Latest completed reconciliation</p></div><div className="bg-surface-raised px-4 py-3"><p className="text-xs text-muted-foreground">Unmatched Statement Lines</p><p className="tabular mt-1 text-lg font-semibold">{account.unreconciled_count}</p><p className="mt-1 text-xs text-muted-foreground">Requires Match, Create, or Ignore</p></div></>}</div>
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label="Bank Account sections">{visibleSections.map((item) => <Link key={item} href={`/b/${businessId}/banking/accounts/${accountId}?section=${item}`} className={`border-b-2 px-3 py-2 text-sm capitalize ${section === item ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item}</Link>)}</nav>
    {section === "transactions" && (
      <BankAccountTransactionsTable businessId={businessId} currency={access.business.currency} rows={serializedHistory} />
    )}
    {section === "imported" && (
      <div className="space-y-6">
        <BatchAutoCategorizeButton businessId={businessId} accountId={accountId} matchesCount={matchedRuleCount} />
        <BankAccountImportedTable
          businessId={businessId}
          accountId={accountId}
          currency={access.business.currency}
          isCashAccount={Boolean(account.is_cash_account)}
          lines={serializedLines}
        />
        {imports.length > 0 && <section><h2 className="mb-2 text-sm font-semibold">Import history</h2><div className="data-panel"><table className="data-table min-w-[720px]"><thead><tr><th>Imported</th><th>File</th><th className="text-right!">Rows</th><th className="text-right!">New</th><th className="text-right!">Duplicates</th></tr></thead><tbody>{imports.map((item) => <tr key={item.id}><td>{formatDate(item.created_at)}</td><td>{item.file_name}</td><td className="tabular text-right">{item.row_count}</td><td className="tabular text-right">{item.imported_count}</td><td className="tabular text-right">{item.duplicate_count}</td></tr>)}</tbody></table></div></section>}
      </div>
    )}
    {section === "reconciliation" && (reconciliations.length ? <div className="data-panel"><table className="data-table min-w-[760px]"><thead><tr><th>Statement Date</th><th className="text-right!">Ending Balance</th><th>Status</th><th className="text-right!">Cleared Items</th><th>Completed</th></tr></thead><tbody>{reconciliations.map((item) => <tr key={item.id}><td><Link href={`/b/${businessId}/banking/accounts/${accountId}/reconcile?reconciliationId=${item.id}`} className="font-medium text-primary hover:underline">{formatDate(item.statement_date)}</Link></td><td className="money text-right">{formatMoney(item.statement_ending_balance_minor, access.business.currency)}</td><td><Badge tone={item.status === "completed" ? "success" : "warning"}>{item.status === "completed" ? "Completed" : "Draft"}</Badge></td><td className="tabular text-right">{item.item_count}</td><td>{item.completed_at ? formatDate(item.completed_at) : "—"}</td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No reconciliations yet</p><p className="mt-1 text-sm text-muted-foreground">Compare the statement ending balance with cleared GL activity.</p>{!account.is_cash_account && <Button permission="create" asChild className="mt-4"><Link href={`/b/${businessId}/banking/accounts/${accountId}/reconcile`}>Start Reconciliation</Link></Button>}</div>)}
    {section === "details" && <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4"><div className="bg-surface-raised p-4"><dt className="text-xs text-muted-foreground">Account code</dt><dd className="mt-1 font-mono text-sm">{account.account_code || "—"}</dd></div><div className="bg-surface-raised p-4"><dt className="text-xs text-muted-foreground">Mapped GL Account</dt><dd className="mt-1 font-medium">{account.ledger_name}</dd></div><div className="bg-surface-raised p-4"><dt className="text-xs text-muted-foreground">Currency</dt><dd className="mt-1 font-medium">{account.currency_code} · Base currency</dd></div><div className="bg-surface-raised p-4"><dt className="text-xs text-muted-foreground">Account number</dt><dd className="mt-1">{account.account_number_masked || "—"}</dd></div></dl>}
  </div>;
}


