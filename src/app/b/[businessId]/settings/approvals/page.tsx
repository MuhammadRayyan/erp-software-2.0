import { SettingsShell } from "@/components/settings-shell";
import { requireModule } from "@/core/permissions/require-module";
import { listApprovalRules } from "@/modules/approvals/approval-policy";
import { ApprovalRulesClient } from "./approval-rules-client";

export const metadata = {
  title: "Approval Rules & Spend Thresholds",
};

export default async function ApprovalRulesSettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  const isAdmin = access.membership.role === "administrator";
  const rules = listApprovalRules(businessId, user.id);

  return (
    <SettingsShell
      businessId={businessId}
      title="Approval Rules & Spend Thresholds"
      description="Configure document-level Maker-Checker spend thresholds and separation-of-duties rules. Per-user approval flags are managed in Users & Access Control."
    >
      <ApprovalRulesClient
        businessId={businessId}
        currency={access.business.currency}
        isAdmin={isAdmin}
        initialRules={rules}
      />
    </SettingsShell>
  );
}
