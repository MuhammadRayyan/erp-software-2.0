import { requireModule } from "@/core/permissions/require-module";
import { SettingsShell } from "@/components/settings-shell";
import {
  getEmailSettings,
  sanitizeEmailSettingsForClient,
} from "@/modules/email/email-settings-service";
import { EmailSettingsClient } from "./email-settings-client";

export const metadata = {
  title: "Email & SMTP Configuration",
};

export default async function EmailSettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");

  if (access.membership.role !== "administrator") {
    return (
      <div className="page-container">
        <p className="text-muted-foreground text-sm">Administrator access is required to configure email settings.</p>
      </div>
    );
  }

  const settings = getEmailSettings(businessId, user.id);
  const clientSettings = sanitizeEmailSettingsForClient(settings);

  return (
    <SettingsShell
      businessId={businessId}
      title="Email & SMTP Configuration"
      description="Connect your business email provider (Hostinger, Google Workspace, Outlook, Amazon SES) to send invoices, quotes, receipts, and statements with custom branding and verified deliverability."
    >
      <EmailSettingsClient businessId={businessId} initialSettings={clientSettings} />
    </SettingsShell>
  );
}
