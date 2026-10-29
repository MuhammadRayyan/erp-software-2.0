import Link from "next/link";
import { Mail, Paperclip } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { DensityToggle } from "@/components/density-toggle";
import { requireAnyModule } from "@/core/permissions/require-module";
import { formatBytes, formatDateTime } from "@/core/format";
import { listSentEmails } from "@/modules/email/email-service";
import { parseMailboxes } from "@/modules/email/email-driver";

export const metadata = { title: "Sent Emails" };

export function getRelatedDocumentPath(
  businessId: string,
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): string | null {
  if (!entityType || !entityId) return null;
  const normalized = entityType.replace(/-/g, "_");
  switch (normalized) {
    case "sales_invoice":
      return `/b/${businessId}/sales/invoices/${entityId}`;
    case "sales_quote":
      return `/b/${businessId}/sales/quotes/${entityId}`;
    case "sales_order":
      return `/b/${businessId}/sales/orders/${entityId}`;
    case "sales_receipt":
    case "receipt":
      return `/b/${businessId}/sales/receipts/${entityId}`;
    case "sales_credit_note":
    case "credit_note":
      return `/b/${businessId}/sales/credit-notes/${entityId}`;
    case "delivery_note":
      return `/b/${businessId}/sales/delivery-notes/${entityId}`;
    case "purchase_invoice":
      return `/b/${businessId}/purchases/invoices/${entityId}`;
    case "purchase_order":
      return `/b/${businessId}/purchases/orders/${entityId}`;
    case "purchase_quote":
      return `/b/${businessId}/purchases/quotes/${entityId}`;
    case "debit_note":
      return `/b/${businessId}/purchases/debit-notes/${entityId}`;
    case "goods_receipt":
      return `/b/${businessId}/purchases/goods-receipts/${entityId}`;
    case "supplier_payment":
    case "purchase_payment":
    case "payment":
      return `/b/${businessId}/purchases/payments/${entityId}`;
    default:
      return null;
  }
}

export default async function SentEmailsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user } = await requireAnyModule(businessId, ["sales", "purchases"]);
  const emails = listSentEmails(businessId, user.id);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sent Emails</h1>
          <p className="page-description">Audit log of every document email dispatched from this business.</p>
        </div>
        <DensityToggle businessId={businessId} />
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
                const relatedHref = getRelatedDocumentPath(businessId, email.relatedEntityType, email.relatedEntityId);
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
                      {relatedHref && email.relatedDocumentNumber ? (
                        <Link
                          href={relatedHref}
                          className="font-medium text-primary hover:underline tabular"
                        >
                          {email.relatedDocumentNumber}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{email.relatedDocumentNumber || "—"}</span>
                      )}
                    </td>
                    <td>
                      {email.attachmentFilename ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Paperclip className="size-3.5" />
                          {email.attachmentFilename}
                          <span className="text-muted-foreground/60">· {formatBytes(email.attachmentSizeBytes)}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="text-muted-foreground">{formatDateTime(email.createdAt)}</td>
                    <td>
                      <StatusBadge status={email.status} />
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
          description="Open a sales or purchase document and use the Email action to send it. Every send is recorded here."
        />
      )}
    </div>
  );
}
