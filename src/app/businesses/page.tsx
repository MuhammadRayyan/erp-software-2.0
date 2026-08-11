import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/core/auth/session";
import { listBusinessesForUser } from "@/core/businesses/business-service";
import { formatRelativeOpened } from "@/core/format";
import { BusinessList } from "./business-list";
import { ImportDialog } from "./import-dialog";

export const metadata = { title: "My Businesses" };

export default async function BusinessesPage() {
  const user = await requireUser();
  const rows = listBusinessesForUser(user.id).map(({ business, membership }) => ({
    id: business.id,
    name: business.name,
    country: business.country,
    currency: business.currency,
    lastOpened: formatRelativeOpened(business.lastOpenedAt),
    role: membership.role,
  }));
  return (
    <main className="page-container max-w-[1050px]">
      <div className="page-header">
        <div><h1 className="page-title">My Businesses</h1><p className="page-description">Open a business or restore a portable backup as a separate copy.</p></div>
        <div className="flex gap-2"><ImportDialog /><Button asChild><Link href="/businesses/new"><Plus className="size-4" /> New Business</Link></Button></div>
      </div>
      <BusinessList businesses={rows} />
    </main>
  );
}
