import { SettingsShell } from "@/components/settings-shell";
import { requireModule } from "@/core/permissions/require-module";
import { listBusinessUsers } from "@/core/permissions/membership-service";
import { UserAccessList } from "@/modules/permissions/user-access-list";

export const metadata = {
  title: "Users & Access Control",
};

export default async function UsersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");

  if (access.membership.role !== "administrator") {
    return (
      <div className="page-container">
        <p className="text-muted-foreground text-sm">Administrator access is required.</p>
      </div>
    );
  }

  const rows = listBusinessUsers(businessId, user.id).map(
    ({ user: member, membership, invitationStatus, isOwner, modules, capabilities }) => ({
      membershipId: membership.id,
      userId: member.id,
      name: member.name,
      email: member.email,
      role: membership.role,
      modules,
      capabilities,
      current: member.id === user.id,
      status: invitationStatus,
      isOwner: Boolean(isOwner),
    })
  );


  return (
    <SettingsShell
      businessId={businessId}
      title="Users & Access Control"
      description="Invite team members, assign administrator or standard roles, configure visible modules, and manage account security."
    >
      <UserAccessList businessId={businessId} users={rows} />
    </SettingsShell>
  );
}
