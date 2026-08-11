import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BusinessForm } from "./business-form";

export const metadata = { title: "New Business" };

export default function NewBusinessPage() {
  return (
    <main className="page-container max-w-[850px]">
      <Link href="/businesses" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> My Businesses</Link>
      <div className="mb-7"><h1 className="page-title">New Business</h1><p className="page-description">Create a clean, isolated workspace. You can change the display name later.</p></div>
      <BusinessForm />
    </main>
  );
}
