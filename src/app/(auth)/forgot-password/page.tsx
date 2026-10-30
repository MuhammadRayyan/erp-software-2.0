import { BrandMark } from "@/components/brand-mark";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = {
  title: "Forgot Password · UAE Manager",
};

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-4 sm:p-8">
      <div className="grid w-full max-w-[980px] overflow-hidden rounded-xl border border-border bg-surface-raised shadow-2xl dark:shadow-none md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[570px] overflow-hidden border-r border-border bg-surface-muted p-10 text-foreground md:flex md:flex-col dark:bg-surface dark:text-foreground">
          <BrandMark />
          <div className="my-auto max-w-sm">
            <p className="mb-4 text-xs font-semibold tracking-[0.15em] text-primary uppercase">
              Password Recovery
            </p>
            <h2 className="text-[38px] leading-[1.08] font-semibold tracking-[-0.045em]">
              Regain access quickly and securely.
            </h2>
            <p className="mt-5 max-w-xs text-[15px] leading-7 text-muted-foreground">
              We send secure, time-limited recovery links directly to your registered email.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2" aria-hidden="true">
            {[34, 52, 43, 64, 47, 72, 58, 82, 68].map((height, index) => (
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
            <ForgotPasswordForm />
          </div>
        </section>
      </div>
    </main>
  );
}
