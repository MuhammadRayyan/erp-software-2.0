import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentSession } from "@/core/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/businesses");
  return (
    <main className="grid min-h-dvh place-items-center p-4 sm:p-8">
      <div className="grid w-full max-w-[980px] overflow-hidden rounded-xl border border-border bg-surface-raised shadow-[0_22px_70px_rgb(30_41_59/0.12)] md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[570px] overflow-hidden border-r border-border bg-[#e8eef6] p-10 text-[#26364a] md:flex md:flex-col dark:bg-[#202a38] dark:text-[#e8edf5]">
          <BrandMark />
          <div className="my-auto max-w-sm">
            <p className="mb-4 text-xs font-semibold tracking-[0.15em] text-primary uppercase">Accounting, clearly</p>
            <h2 className="text-[38px] leading-[1.08] font-semibold tracking-[-0.045em]">Simple books for real businesses.</h2>
            <p className="mt-5 max-w-xs text-[15px] leading-7 text-[#607086] dark:text-[#a7b2c1]">
              Direct workflows, portable business data, and a quieter place to get financial work done.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2" aria-hidden="true">
            {[34, 52, 43, 64, 47, 72, 58, 82, 68].map((height, index) => (
              <span key={index} className="flex h-14 items-end rounded-md border border-[#c8d3e1] bg-white/45 p-2 dark:border-[#344255] dark:bg-white/[0.03]">
                <span className="w-full rounded-[2px] bg-primary/45" style={{ height: `${height}%` }} />
              </span>
            ))}
          </div>
        </section>
        <section className="flex min-h-[540px] items-center px-6 py-10 sm:px-12 md:min-h-[570px]">
          <div className="mx-auto w-full max-w-sm">
            <BrandMark className="mb-10 md:hidden" />
            <LoginForm />
            <p className="mt-7 text-center text-xs leading-5 text-muted-foreground">
              Local accounting build · Your business files stay isolated.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
