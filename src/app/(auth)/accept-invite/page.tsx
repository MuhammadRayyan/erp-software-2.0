import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { verifyInvitationToken } from "@/core/permissions/invitation-service";
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata = {
  title: "Accept Invitation · UAE Manager",
};

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const token = params.token || "";

  const verification = verifyInvitationToken(token);

  return (
    <main className="grid min-h-dvh place-items-center p-4 sm:p-8">
      <div className="grid w-full max-w-[980px] overflow-hidden rounded-xl border border-border bg-surface-raised shadow-2xl dark:shadow-none md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[570px] overflow-hidden border-r border-border bg-surface-muted p-10 text-foreground md:flex md:flex-col dark:bg-surface dark:text-foreground">
          <BrandMark />
          <div className="my-auto max-w-sm">
            <p className="mb-4 text-xs font-semibold tracking-[0.15em] text-primary uppercase">
              Team Collaboration
            </p>
            <h2 className="text-[38px] leading-[1.08] font-semibold tracking-[-0.045em]">
              Join your company books in one click.
            </h2>
            <p className="mt-5 max-w-xs text-[15px] leading-7 text-muted-foreground">
              Work together on quotes, invoices, bills, and accounting with fine-grained access control.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2" aria-hidden="true">
            {[45, 60, 50, 75, 55, 85, 70, 95, 80].map((height, index) => (
              <span
                key={index}
                className="flex h-14 items-end rounded-md border border-border bg-white/45 p-2 dark:border-border dark:bg-white/[0.03]"
              >
                <span className="w-full rounded-[2px] bg-primary/45" style={{ height: `${height}%` }} />
              </span>
            ))}
          </div>
        </section>

        <section className="flex min-h-[540px] items-center px-6 py-10 sm:px-12 md:min-h-[570px]">
          <div className="mx-auto w-full max-w-sm">
            <BrandMark className="mb-10 md:hidden" />

            {!verification.valid || !verification.data ? (
              <div className="space-y-5">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    Invitation Link Expired or Invalid
                  </div>
                  <p className="leading-relaxed">
                    {verification.error ||
                      "This invitation link has expired or has already been used. Please contact your workspace administrator to send you a fresh invitation."}
                  </p>
                </div>
                <Button asChild variant="secondary" className="w-full gap-2">
                  <Link href="/login">
                    <ArrowLeft className="size-4" /> Return to Sign In
                  </Link>
                </Button>
              </div>
            ) : (
              <AcceptInviteForm
                token={token}
                email={verification.data.email}
                defaultName={verification.data.name}
                businessName={verification.data.businessName}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
