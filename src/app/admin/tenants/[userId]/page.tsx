import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/core/auth/session";
import { getTenantDetails } from "@/core/admin/tenant-service";
import { TenantDetailView } from "./tenant-detail-view";

export const metadata = {
  title: "Tenant Details | Admin Control Panel",
};

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireSuperAdmin();
  const { userId } = await params;
  const details = getTenantDetails(userId);

  if (!details) {
    notFound();
  }

  return (
    <main className="page-container max-w-7xl py-6 space-y-6">
      <TenantDetailView initialDetails={details} />
    </main>
  );
}
