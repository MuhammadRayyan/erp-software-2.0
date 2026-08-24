import Link from "next/link";
import { Mail, Paperclip } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireModule } from "@/core/permissions/require-module";
import { formatDateTime } from "@/core/format";
import { listSentEmails } from "@/modules/email/email-service";
import { parseMailboxes } from "@/modules/email/email-driver";

export const metadata = { title: "Sent Emails" };

const STATUS_TONES: Record<string, "success" | "danger" | "neutral" | "info"> = {
  sent: "success",
  delivered: "success",
  failed: "danger",
  queued: "info",
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default async function SentEmailsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "sales");
  const emails = listSentEmails(businessId, user.id);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sent Emails</h1>
          <p className="page-description">Audit log of every invoice email dispatched from this business.</p>
        </div>
      </div>
      {emails.length ? (
        <div className="data-panel overflow-x-auto">
          <table className="data-table min-w-[860px]">
            <thead>
              <tr>
                <th>Subject</th>
                <th>To</th>
                <th>Related</th>
                <th>Attachment</th>
                <th>Sent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => {
                const to = parseMailboxes(email.toAddresses)[0];
                const extra = parseMailboxes(email.toAddresses).length - 1;
                return (
                  <tr key={email.id} className="hover:bg-surface-muted/40">
                    <td>
                      <Link href={`/b/${businessId}/emails/${email.id}`} className="font-medium text-primary hover:underline">
                        {email.subject}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">From {email.fromAddress}</p>
                    </td>
                    <td>
                      <span className="font-medium">{to ? (to.name ? `${to.name} <${to.email}>` : to.email) : "—"}</span>
                      {extra > 0 && <span className="ml-1 text-xs text-muted-foreground">+{extra} more</span>}
                      {email.ccAddresses && (
                        <p className="mt-0.5 text-xs text-muted-foreground">CC: {email.ccAddresses}</p>
                      )}
                    </td>
                    <td>
                      {email.relatedEntityType === "sales_invoice" && email.relatedDocumentNumber ? (
                        <Link
                          href={`/b/${businessId}/sales/invoices/${email.relatedEntityId}`}
                          className="font-medium text-primary hover:underline tabular"
                        >
                          {email.relatedDocumentNumber}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      {email.attachmentFilename ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Paperclip className="size-3.5" />
                          {email.attachmentFilename}
                          <span className="text-muted-foreground/60">· {formatSize(email.attachmentSizeBytes)}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="text-muted-foreground">{formatDateTime(email.createdAt)}</td>
                    <td>
                      <Badge tone={STATUS_TONES[email.status] ?? "neutral"} className="capitalize">
                        {email.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<Mail className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No sent emails yet"
          description="Open a sales invoice and use the Email action to send it to a customer. Every send is recorded here."
        />
      )}
    </div>
  );
}
