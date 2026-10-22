import { redirect } from "next/navigation";
import { getCurrentSession } from "@/core/auth/session";
import { isSetupComplete } from "@/core/auth/setup-service";
import { LandingHero } from "./landing-hero";

export const metadata = {
  title: "Ledgerly ERP | Next-Generation Enterprise Accounting & Operations",
  description:
    "Zero-latency multi-entity double-entry ledger, statutory UAE VAT compliance, and isolated tenant databases.",
};

export default async function HomePage() {
  if (!isSetupComplete()) {
    redirect("/setup");
  }

  const session = await getCurrentSession();

  return <LandingHero user={session?.user ?? null} />;
}
