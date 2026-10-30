import { existsSync } from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentSession } from "@/core/auth/session";
import { isSetupComplete } from "@/core/auth/setup-service";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

/** Served from public/downloads when a source archive is present (delivery convenience; auto-hides otherwise). */
function getSourceArchiveUrl(): string | null {
  try {
    if (existsSync(path.join(process.cwd(), "public", "downloads", "uae-manager-source.zip"))) {
      return "/downloads/uae-manager-source.zip";
    }
    if (existsSync(path.join(process.cwd(), "public", "downloads", "ledgerly-erp-v2.1.1-source.zip"))) {
      return "/downloads/ledgerly-erp-v2.1.1-source.zip";
    }
    return null;
  } catch {
    return null;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ setup?: string; redirect?: string; suspended?: string; reset?: string; registered?: string; email?: string }>;
}) {
  if (!isSetupComplete()) {
    redirect("/setup");
  }

  const params = searchParams ? await searchParams : {};
  const redirectTo = params.redirect || "/businesses";
  if (await getCurrentSession()) redirect(redirectTo);
  const showSetupSuccess = params.setup === "success";
  const showSuspendedNotice = params.suspended === "1";
  const showResetSuccess = params.reset === "1";
  const showRegisteredSuccess = params.registered === "1";
  const sourceArchiveUrl = getSourceArchiveUrl();
  return (
    <main className="grid min-h-dvh place-items-center p-4 sm:p-8">
      <div className="grid w-full max-w-[980px] overflow-hidden rounded-xl border border-border bg-surface-raised shadow-2xl dark:shadow-none md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[570px] overflow-hidden border-r border-border bg-surface-muted p-10 text-foreground md:flex md:flex-col dark:bg-surface dark:text-foreground">
          <BrandMark />
          <div className="my-auto max-w-sm">
            <p className="mb-4 text-xs font-semibold tracking-[0.15em] text-primary uppercase">Accounting, clearly</p>
            <h2 className="text-[38px] leading-[1.08] font-semibold tracking-[-0.045em]">Simple books for real businesses.</h2>
            <p className="mt-5 max-w-xs text-[15px] leading-7 text-muted-foreground dark:text-muted-foreground">
              Direct workflows, portable business data, and a quieter place to get financial work done.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2" aria-hidden="true">
            {[34, 52, 43, 64, 47, 72, 58, 82, 68].map((height, index) => (
              <span key={index} className="flex h-14 items-end rounded-md border border-border bg-white/45 p-2 dark:border-border dark:bg-white/[0.03]">
                <span className="w-full rounded-[2px] bg-primary/45" style={{ height: `${height}%` }} />
              </span>
            ))}
          </div>
        </section>
        <section className="flex min-h-[540px] items-center px-6 py-10 sm:px-12 md:min-h-[570px]">
          <div className="mx-auto w-full max-w-sm">
            <BrandMark className="mb-10 md:hidden" />
            {showSetupSuccess && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <strong className="font-semibold">Super-Admin Setup Complete</strong>
                  <p className="mt-0.5 text-muted-foreground dark:text-emerald-300/80">
                    Your platform root account is active. Sign in below using your master credentials.
                  </p>
                </div>
              </div>
            )}
            {showResetSuccess && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <strong className="font-semibold">Password Reset Successful</strong>
                  <p className="mt-0.5 text-muted-foreground dark:text-emerald-300/80">
                    Your new password has been set. Please sign in with your updated credentials.
                  </p>
                </div>
              </div>
            )}
            {showRegisteredSuccess && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <strong className="font-semibold">Account Setup Complete</strong>
                  <p className="mt-0.5 text-muted-foreground dark:text-emerald-300/80">
                    Your account registration is verified. Sign in below to enter your workspace.
                  </p>
                </div>
              </div>
            )}
            {showSuspendedNotice && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <strong className="font-semibold">Account Suspended</strong>
                  <p className="mt-0.5 text-muted-foreground dark:text-amber-300/80">
                    This account has been suspended by the platform administrator. Access has been temporarily restricted.
                  </p>
                </div>
              </div>
            )}
            <LoginForm redirectTo={redirectTo} initialEmail={params.email || ""} />
            <p className="mt-7 text-center text-xs leading-5 text-muted-foreground">
              UAE Manager · Local accounting build · Your business files stay isolated.
            </p>
            {sourceArchiveUrl ? (
              <a
                href={sourceArchiveUrl}
                download
                className="group mx-auto mt-3 flex min-h-11 w-fit items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-2 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Download className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
                Download source archive (.zip)
              </a>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
