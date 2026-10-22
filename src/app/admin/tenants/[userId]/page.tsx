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
    <main className="mx-auto max-w-7xl p-4 sm:p-8">
      <TenantDetailView initialDetails={details} />
    </main>
  );
}
