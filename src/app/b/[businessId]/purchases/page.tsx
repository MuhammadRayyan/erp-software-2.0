import { redirect } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) { const { businessId } = await params; await requireModule(businessId, "purchases"); redirect(`/b/${businessId}/purchases/invoices`); }
