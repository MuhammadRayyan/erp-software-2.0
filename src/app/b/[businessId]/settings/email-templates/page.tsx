import { requireModule } from "@/core/permissions/require-module";
import { BackLink } from "@/components/back-link";
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
    <div className="page-container max-w-6xl space-y-6">
      <BackLink href={`/b/${businessId}/settings`}>Settings</BackLink>
      <div className="page-header">
        <div>
          <h1 className="page-title">Email Templates</h1>
          <p className="page-description">
            Customize outbound messages and subjects with dynamic tokens (customer name, document number, total amount, balance due) for all document dispatches.
          </p>
        </div>
      </div>
      <EmailTemplateManager businessId={businessId} initialTemplates={templates} />
    </div>
  );
}
