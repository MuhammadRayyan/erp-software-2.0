import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/core/auth/session";

export default async function SuperAdminRedirectPage() {
  await requireSuperAdmin();
  redirect("/admin");
}
