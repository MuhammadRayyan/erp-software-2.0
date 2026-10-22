import { redirect } from "next/navigation";
import { getCurrentSession } from "@/core/auth/session";
import { isSetupComplete } from "@/core/auth/setup-service";

export default async function HomePage() {
  if (!isSetupComplete()) {
    redirect("/setup");
  }

  const session = await getCurrentSession();
  redirect(session ? "/businesses" : "/login");
}
