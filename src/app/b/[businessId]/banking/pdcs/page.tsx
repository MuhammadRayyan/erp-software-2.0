import { requireModule } from "@/core/permissions/require-module";
import { listBankAccounts } from "@/modules/banking/bank-account-service";
import { listCustomers } from "@/modules/customers/customer-service";
import { listSuppliers } from "@/modules/suppliers/supplier-service";
import { getPdcMaturitySummary, listPdcs } from "@/modules/banking/pdc-service";
import { PdcsClient } from "./pdcs-client";

export const metadata = {
  title: "Post-Dated Cheques (PDC)",
};

export default async function PdcsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "banking");

  const pdcs = listPdcs(businessId, user.id);
  const summary = getPdcMaturitySummary(businessId, user.id, 30);
  const bankAccounts = listBankAccounts(businessId, user.id).filter((a) => a.is_active);
  const customers = listCustomers(businessId, user.id).filter((c) => c.isActive);
  const suppliers = listSuppliers(businessId, user.id).filter((s) => s.is_active);

  return (
    <PdcsClient
      businessId={businessId}
      currency={access.business.currency}
      initialPdcs={pdcs}
      summary={summary}
      bankAccounts={bankAccounts.map((a) => ({ id: a.id, name: a.name, currencyCode: a.currency_code }))}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
