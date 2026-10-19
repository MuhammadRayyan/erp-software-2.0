import { notFound } from "next/navigation";
import { SettingsShell } from "@/components/settings-shell";
import { requireUser } from "@/core/auth/session";
import { getBusinessForUser } from "@/core/businesses/business-service";
import { ProfileClient } from "./profile-client";

export const metadata = {
  title: "My Profile & Security",
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();
  const access = getBusinessForUser(businessId, user.id);

  if (!access) {
    notFound();
  }

  return (
    <SettingsShell
      businessId={businessId}
      title="My Profile & Security"
      description="View account identity, update your display name, and manage your account password."
    >
      <ProfileClient
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
        }}
        role={access.membership.role}
      />
    </SettingsShell>
  );
}
