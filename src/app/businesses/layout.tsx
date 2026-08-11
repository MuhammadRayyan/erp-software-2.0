import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { requireUser } from "@/core/auth/session";

export default async function BusinessesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center border-b border-border bg-surface px-4 sm:px-6">
        <Link href="/businesses"><BrandMark /></Link>
        <div className="ml-auto"><AccountMenu user={{ name: user.name, email: user.email }} /></div>
      </header>
      {children}
    </div>
  );
}
