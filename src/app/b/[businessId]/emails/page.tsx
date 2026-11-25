import { Mail } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireAnyModule } from "@/core/permissions/require-module";
import { listSentEmails } from "@/modules/email/email-service";
import { SentEmailTable, type SentEmailRow } from "@/modules/email/sent-email-table";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";

export const metadata = { title: "Sent Emails" };

export default async function SentEmailsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user } = await requireAnyModule(businessId, ["sales", "purchases"]);
  const emails = listSentEmails(businessId, user.id) as unknown as SentEmailRow[];
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));

  return (
    <div className="page-container">
      <PageHeader
        title="Sent Emails"
        description="Dispatched document emails and delivery logs."
      />
      {emails.length ? (
        <SentEmailTable
          businessId={businessId}
          emails={emails}
          serverSnapshot={columnSnapshots["sent-emails"]}
        />
      ) : (
        <EmptyState
          icon={<Mail className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No sent emails yet"
          description="Open a sales or purchase document and use the Email action to send it. Every send is recorded here."
        />
      )}
    </div>
  );
}
