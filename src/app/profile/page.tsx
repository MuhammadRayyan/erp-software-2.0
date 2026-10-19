import { redirect } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { listBusinessesForUser } from "@/core/businesses/business-service";

export const metadata = {
  title: "Profile & Security",
};

export default async function ProfileRedirectPage() {
  const user = await requireUser();
  const businesses = listBusinessesForUser(user.id);
  if (businesses.length > 0) {
    redirect(`/b/${businesses[0].business.id}/settings/profile`);
  }
  redirect("/businesses");
}
