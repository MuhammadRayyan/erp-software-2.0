import Link from "next/link";
import { FileText, Paperclip } from "lucide-react";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requireAnyModule } from "@/core/permissions/require-module";
import { formatBytes, formatDateTime } from "@/core/format";
import { getSentEmail } from "@/modules/email/email-service";
import { parseMailboxes } from "@/modules/email/email-driver";
import { BackLink } from "@/components/back-link";
import { getRelatedDocumentPath } from "../page";

export const metadata = { title: "Sent Email" };

function displayMailbox(mailboxes: ReturnType<typeof parseMailboxes>): string {
  if (mailboxes.length === 0) return "—";
  return mailboxes
    .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
    .join(", ");
}

export default async function SentEmailViewPage({ params }: { params: Promise<{ businessId: string; emailId: string }> }) {
  const { businessId, emailId } = await params;
  const { user } = await requireAnyModule(businessId, ["sales", "purchases"]);
  const email = getSentEmail(businessId, user.id, emailId);
  if (!email) notFound();
  const to = parseMailboxes(email.toAddresses);
  const cc = parseMailboxes(email.ccAddresses);
  const documentPath = getRelatedDocumentPath(businessId, email.relatedEntityType, email.relatedEntityId);

  return (
    <div className="page-container">
      <BackLink href={`/b/${businessId}/emails`}>Sent Emails</BackLink>
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title">{email.subject}</h1>
            <StatusBadge status={email.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Sent {formatDateTime(email.createdAt)}</p>
          {email.sentAt && email.sentAt !== email.createdAt && (
            <p className="mt-1 text-xs text-muted-foreground">Delivery timestamp: {formatDateTime(email.sentAt)}</p>
          )}
          {email.errorMessage && (
            <p className="mt-2 text-sm text-danger">Error: {email.errorMessage}</p>
          )}
        </div>
        {documentPath && email.relatedDocumentNumber && (
          <Button permission={"view"} asChild variant="secondary">
            <Link href={documentPath}>
              <FileText className="size-4" /> View {email.relatedDocumentNumber}
            </Link>
          </Button>
        )}
      </div>

      <section className="mb-5 rounded-lg border border-border bg-surface-raised p-5">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">From</dt>
            <dd className="mt-1 font-medium text-foreground">{email.fromAddress}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">To</dt>
            <dd className="mt-1 text-foreground">{displayMailbox(to)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">CC</dt>
            <dd className="mt-1 text-foreground">{cc.length ? displayMailbox(cc) : "—"}</dd>
          </div>
          {email.attachmentFilename && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Attachment</dt>
              <dd className="mt-1 inline-flex items-center gap-1.5 text-foreground">
                <Paperclip className="size-3.5 text-muted-foreground" />
                {email.attachmentFilename}
                <span className="text-xs text-muted-foreground">· {formatBytes(email.attachmentSizeBytes)}</span>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Message-ID</dt>
            <dd className="mt-1 text-xs text-muted-foreground tabular break-all">{email.messageId}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Email body preview" className="rounded-lg border border-border bg-surface-raised overflow-hidden">
        <header className="border-b border-border bg-surface-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Body Preview
        </header>
        <iframe
          title="Email body preview"
          srcDoc={email.bodyHtml}
          sandbox=""
          className="h-[600px] w-full bg-white"
        />
      </section>
    </div>
  );
}
