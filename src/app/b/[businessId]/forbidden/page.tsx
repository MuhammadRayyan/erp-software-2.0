import { PermissionDenied } from "@/components/permission-denied";

export default async function ForbiddenPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ module?: string }> }) {
  const { businessId } = await params;
  const { module } = await searchParams;
  return <PermissionDenied module={module} returnHref={`/b/${businessId}/overview`} returnLabel="Return to overview" />;
}
