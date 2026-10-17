import { requireModule } from "@/core/permissions/require-module";
import { getBusinessDb } from "@/core/db/business";
import { BackLink } from "@/components/back-link";
import {
  findRecodableLines,
  type FindLinesFilters,
  type RecodableSourceType,
} from "@/modules/accounting/services/find-and-recode-service";
import { FindAndRecodeView } from "@/modules/accounting/find-and-recode-view";

export const metadata = {
  title: "Find & Recode Transactions",
};

export default async function FindAndRecodePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    sourceType?: string;
    dateFrom?: string;
    dateTo?: string;
    accountId?: string;
    taxCodeId?: string;
    projectId?: string;
    query?: string;
  }>;
}) {
  const { businessId } = await params;
  const search = await searchParams;
  const { user, access } = await requireModule(businessId, "accounting");
  const { sqlite } = getBusinessDb(businessId, user.id);

  const filters: FindLinesFilters = {
    sourceType: (search.sourceType as RecodableSourceType | "all") || "all",
    dateFrom: search.dateFrom || undefined,
    dateTo: search.dateTo || undefined,
    accountId: search.accountId || undefined,
    taxCodeId: search.taxCodeId || undefined,
    projectId: search.projectId || undefined,
    query: search.query || undefined,
  };

  const lines = findRecodableLines(businessId, user.id, filters);

  const accounts = sqlite
    .prepare("SELECT id, name, type, subtype FROM accounts WHERE is_active = 1 ORDER BY type, name")
    .all() as Array<{ id: string; name: string; type: string; subtype: string }>;

  const taxCodes = sqlite
    .prepare("SELECT id, name, rate_basis_points FROM tax_codes WHERE is_active = 1 ORDER BY name")
    .all() as Array<{ id: string; name: string; rate_basis_points: number }>;

  const projects = sqlite
    .prepare("SELECT id, code, name FROM projects WHERE is_active = 1 ORDER BY code")
    .all() as Array<{ id: string; code: string; name: string }>;

  return (
    <div className="page-container space-y-6">
      <BackLink href={`/b/${businessId}/accounting/journal`}>Journal Entries</BackLink>
      <div className="page-header">
        <div>
          <h1 className="page-title">Find & Recode</h1>
          <p className="page-description">
            Search transaction lines across Sales Invoices, Purchase Bills, Bank Entries, and Journals to bulk reclassify GL Accounts, Tax Codes, or Projects.
          </p>
        </div>
      </div>

      <FindAndRecodeView
        businessId={businessId}
        initialLines={lines}
        initialFilters={filters}
        accounts={accounts}
        taxCodes={taxCodes}
        projects={projects}
        currency={access.business.currency}
      />
    </div>
  );
}
