"use client";
import { SelectNative } from "@/components/ui/select-native";
import { FormError } from "@/components/form-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeBaseCurrencyAction,
  deleteExchangeRateAction,
  saveCurrencyAction,
  saveExchangeRateAction,
  saveRealizedFxAccountsAction,
} from "./actions";


type Currency = { code: string; name: string; symbol: string | null; minor_unit: number; is_base: number; is_active: number };
type Rate = { id: string; currency_code: string; rate_date: string; rate_to_base: string; source: "Manual" | "CBUAE"; source_reference: string | null };
type Account = { id: string; code: string; name: string };

export function CurrencySettingsForm({
  businessId, baseCode, baseLocked, isAdmin, currencies, rates, gainAccounts, lossAccounts, gainAccountId, lossAccountId,
}: {
  businessId: string; baseCode: string; baseLocked: boolean; isAdmin: boolean; currencies: Currency[]; rates: Rate[];
  gainAccounts: Account[]; lossAccounts: Account[]; gainAccountId: string; lossAccountId: string;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const foreign = currencies.filter((currency) => !currency.is_base && currency.is_active);
  const [rate, setRate] = useState({ currencyCode: foreign[0]?.code ?? "USD", rateDate: today, rateToBase: "", source: "Manual" as "Manual" | "CBUAE", sourceReference: "" });
  const [newCurrency, setNewCurrency] = useState({ code: "", name: "", symbol: "", minorUnit: 2, isActive: true });
  const [fxAccounts, setFxAccounts] = useState({ gainAccountId, lossAccountId });
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  async function run(key: string, action: () => Promise<{ error?: string }>, success: string) {
    setPending(key); setError("");
    const result = await action();
    setPending("");
    if (result.error) return setError(result.error);
    toast.success(success); router.refresh();
  }

  return <div className="space-y-8 max-w-4xl">
    {!isAdmin && <div className="rounded-md border border-info/25 bg-info/10 px-3 py-2 text-sm">Currency settings are read-only for non-Administrators.</div>}
    {error && <FormError message={error} />}

    <section className="space-y-4">
      <div><h2 className="text-base font-semibold">Currency master</h2><p className="mt-1 text-sm text-muted-foreground">The base currency is used by the general ledger. Minor units control authoritative document rounding.</p></div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised [contain:layout_paint]">
        <table className="data-table min-w-[820px]"><thead><tr><th>Code</th><th>Name</th><th className="text-right!">Minor units</th><th>Status</th><th className="text-right!">Base</th><th className="text-right!">Actions</th></tr></thead><tbody>
          {currencies.map((currency) => <tr key={currency.code}><td className="font-mono font-semibold">{currency.code}</td><td>{currency.name}</td><td className="money text-right">{currency.minor_unit}</td><td>{currency.is_active ? "Enabled" : "Disabled"}</td><td className="text-right">{currency.is_base ? <span className="font-medium">Current base</span> : <Button size="sm" variant="ghost" disabled={!isAdmin || baseLocked || !currency.is_active || pending === `base-${currency.code}`} onClick={() => run(`base-${currency.code}`, () => changeBaseCurrencyAction(businessId, currency.code), `Base currency changed to ${currency.code}.`)}>Make base</Button>}</td><td><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" disabled={!isAdmin || Boolean(pending)} onClick={() => setNewCurrency({ code: currency.code, name: currency.name, symbol: currency.symbol ?? "", minorUnit: currency.minor_unit, isActive: Boolean(currency.is_active) })}>Edit</Button>{!currency.is_base && <Button size="sm" variant="ghost" disabled={!isAdmin || Boolean(pending)} onClick={() => run(`toggle-${currency.code}`, () => saveCurrencyAction(businessId, { code: currency.code, name: currency.name, symbol: currency.symbol ?? "", minorUnit: currency.minor_unit, isActive: !currency.is_active }), `${currency.code} ${currency.is_active ? "disabled" : "enabled"}.`)}>{currency.is_active ? "Disable" : "Enable"}</Button>}</div></td></tr>)}
        </tbody></table>
      </div>
      {baseLocked && <p className="text-xs text-muted-foreground">Base-currency changes are locked because accounting activity exists.</p>}
      {isAdmin && <div className="grid gap-3 rounded-lg border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-[90px_1fr_90px_100px_auto]">
        <div><Label htmlFor="currency-code">Code</Label><Input id="currency-code" maxLength={3} value={newCurrency.code} onChange={(event) => setNewCurrency((current) => ({ ...current, code: event.target.value.toUpperCase() }))} /></div>
        <div><Label htmlFor="currency-name">Name</Label><Input id="currency-name" value={newCurrency.name} onChange={(event) => setNewCurrency((current) => ({ ...current, name: event.target.value }))} /></div>
        <div><Label htmlFor="currency-symbol">Symbol</Label><Input id="currency-symbol" value={newCurrency.symbol} onChange={(event) => setNewCurrency((current) => ({ ...current, symbol: event.target.value }))} /></div>
        <div><Label htmlFor="minor-unit">Minor unit</Label><Input id="minor-unit" type="number" min={0} max={6} value={newCurrency.minorUnit} onChange={(event) => setNewCurrency((current) => ({ ...current, minorUnit: Number(event.target.value) }))} /></div>
        <Button className="self-end" disabled={Boolean(pending)} onClick={() => run("currency", () => saveCurrencyAction(businessId, newCurrency), "Currency saved.")}><Plus className="size-4" /> {currencies.some((currency) => currency.code === newCurrency.code) ? "Save currency" : "Add currency"}</Button>
      </div>}
    </section>

    <section className="space-y-4">
      <div><h2 className="text-base font-semibold">Exchange rates</h2><p className="mt-1 text-sm text-muted-foreground">Convention: {baseCode} units per 1 foreign unit. CBUAE is a manual label in this phase; no rates are downloaded.</p></div>
      {isAdmin && <div className="grid gap-3 rounded-lg border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-[100px_140px_1fr_120px_1fr_auto]">
        <div><Label htmlFor="rate-currency">Currency</Label><SelectNative id="rate-currency"  value={rate.currencyCode} onChange={(event) => setRate((current) => ({ ...current, currencyCode: event.target.value }))}>{foreign.map((currency) => <option key={currency.code}>{currency.code}</option>)}</SelectNative></div>
        <div><Label htmlFor="rate-date">Date</Label><Input id="rate-date" type="date" value={rate.rateDate} onChange={(event) => setRate((current) => ({ ...current, rateDate: event.target.value }))} /></div>
        <div><Label htmlFor="rate-value">Rate to {baseCode}</Label><Input id="rate-value" inputMode="decimal" placeholder="3.672500" value={rate.rateToBase} onChange={(event) => setRate((current) => ({ ...current, rateToBase: event.target.value }))} /></div>
        <div><Label htmlFor="rate-source">Source</Label><SelectNative id="rate-source"  value={rate.source} onChange={(event) => setRate((current) => ({ ...current, source: event.target.value as "Manual" | "CBUAE" }))}><option>Manual</option><option>CBUAE</option></SelectNative></div>
        <div><Label htmlFor="rate-reference">Reference</Label><Input id="rate-reference" placeholder="Demo / bulletin reference" value={rate.sourceReference} onChange={(event) => setRate((current) => ({ ...current, sourceReference: event.target.value }))} /></div>
        <Button className="self-end" disabled={Boolean(pending) || foreign.length === 0} onClick={() => run("rate", () => saveExchangeRateAction(businessId, rate), "Exchange rate saved.")}>{pending === "rate" && <LoaderCircle className="size-4 animate-spin" />} Save rate</Button>
      </div>}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised [contain:layout_paint]"><table className="data-table min-w-[760px]"><thead><tr><th>Date</th><th>Currency</th><th>Rate</th><th>Source</th><th>Reference</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {rates.length === 0 ? <tr><td colSpan={6} className="text-center text-muted-foreground">No foreign-currency rates yet.</td></tr> : rates.map((entry) => <tr key={entry.id}><td>{entry.rate_date}</td><td className="font-mono">{entry.currency_code}</td><td className="money">1 {entry.currency_code} = {entry.rate_to_base} {baseCode}</td><td>{entry.source}</td><td>{entry.source_reference ?? "—"}</td><td className="text-right"><Button size="icon" variant="ghost" aria-label={`Delete ${entry.currency_code} rate for ${entry.rate_date}`} disabled={!isAdmin || Boolean(pending)} onClick={() => run(`delete-${entry.id}`, () => deleteExchangeRateAction(businessId, entry.id), "Exchange rate deleted.")}><Trash2 className="size-4" /></Button></td></tr>)}
      </tbody></table></div>
    </section>

    <section className="space-y-4">
      <div><h2 className="text-base font-semibold">Realized FX accounts</h2><p className="mt-1 text-sm text-muted-foreground">Settlement differences post automatically to these base-currency GL accounts.</p></div>
      <div className="grid gap-4 rounded-lg border border-border bg-surface-raised p-4 sm:grid-cols-2">
        <div><Label htmlFor="fx-gain">Realized FX Gain</Label><SelectNative id="fx-gain"  disabled={!isAdmin} value={fxAccounts.gainAccountId} onChange={(event) => setFxAccounts((current) => ({ ...current, gainAccountId: event.target.value }))}>{gainAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</SelectNative></div>
        <div><Label htmlFor="fx-loss">Realized FX Loss</Label><SelectNative id="fx-loss"  disabled={!isAdmin} value={fxAccounts.lossAccountId} onChange={(event) => setFxAccounts((current) => ({ ...current, lossAccountId: event.target.value }))}>{lossAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</SelectNative></div>
        {isAdmin && <div className="sm:col-span-2 flex justify-end"><Button disabled={Boolean(pending)} onClick={() => run("accounts", () => saveRealizedFxAccountsAction(businessId, fxAccounts), "Realized FX accounts saved.")}>Save accounts</Button></div>}
      </div>
    </section>
  </div>;
}
