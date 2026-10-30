import { redirect } from "next/navigation";
import { Shield, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { isSetupComplete } from "@/core/auth/setup-service";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Platform Setup | UAE Manager" };

export default async function SetupPage({
  searchParams,
}: {
  searchParams?: Promise<{ key?: string }>;
}) {
  if (isSetupComplete()) {
    redirect("/login");
  }

  const params = searchParams ? await searchParams : {};
  const initialKey = params.key ?? "";

  return (
    <main className="grid min-h-dvh place-items-center p-4 sm:p-8">
      <div className="grid w-full max-w-[980px] overflow-hidden rounded-xl border border-border bg-surface-raised shadow-2xl dark:shadow-none md:grid-cols-[1fr_1.1fr]">
        <section className="relative hidden min-h-[600px] flex-col justify-between border-r border-border bg-surface-muted p-10 text-foreground md:flex dark:bg-surface dark:text-foreground">
          <BrandMark />
          <div className="my-auto max-w-sm">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" /> Initial Platform Setup
            </div>
            <h2 className="mt-4 text-[34px] leading-[1.1] font-semibold tracking-[-0.04em]">
              Initialize your root workspace.
            </h2>
            <p className="mt-4 text-[14px] leading-6 text-muted-foreground">
              Welcome to UAE Manager. Before entering the application, you must establish the permanent Super-Admin
              account.
            </p>
            <div className="mt-6 space-y-3 rounded-lg border border-border bg-surface/60 p-4 text-xs text-muted-foreground">
              <div className="flex items-start gap-2 text-foreground">
                <Shield className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <strong>Immutable Root Account:</strong> Protected by database engine triggers. Cannot be deleted or
                  locked out.
                </span>
              </div>
              <p>
                Once initialized, this setup wizard is permanently locked and inaccessible to prevent unauthorized access.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            UAE Manager · Self-Hosted Accounting & Workspace Infrastructure
          </p>
        </section>

        <section className="flex min-h-[580px] items-center px-6 py-10 sm:px-12">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-6">
              <BrandMark className="mb-6 md:hidden" />
              <h1 className="text-2xl font-semibold tracking-[-0.025em]">First-Time Setup</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter your server Setup Key to authorize super-admin creation.
              </p>
            </div>

            <SetupForm initialKey={initialKey} />

            <div className="mt-8 border-t border-border pt-4 text-center">
              <p className="text-[11px] text-muted-foreground">
                All tenant workspaces and company databases remain isolated within your private server instance.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
