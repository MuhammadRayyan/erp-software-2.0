import { requireModule } from "@/core/permissions/require-module";
import { SettingsShell } from "@/components/settings-shell";
import { listEmailTemplates } from "@/modules/email/email-template-service";
import { EmailTemplateManager } from "@/modules/email/components/email-template-manager";

export const metadata = {
  title: "Email Templates",
};

export default async function EmailTemplatesSettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  await requireModule(businessId, "settings");
  const templates = listEmailTemplates(businessId);

  return (
    <SettingsShell
      businessId={businessId}
      title="Email Templates"
      description="Customize outbound messages and subjects with dynamic tokens (customer name, document number, total amount, balance due) for all document dispatches."
    >
      <EmailTemplateManager businessId={businessId} initialTemplates={templates} />
    </SettingsShell>
  );
}

