import { SettingsShell } from "@/components/settings-shell";
import { requireModule } from "@/core/permissions/require-module";
import { listBusinessUsers } from "@/core/permissions/membership-service";
import { parseModules } from "@/core/permissions/permissions";
import { UserAccessList } from "@/modules/permissions/user-access-list";

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
        <p>Administrator access is required.</p>
      </div>
    );
  }

  const rows = listBusinessUsers(businessId, user.id).map(({ user: member, membership }) => ({
    membershipId: membership.id,
    userId: member.id,
    name: member.name,
    email: member.email,
    role: membership.role,
    modules: parseModules(membership.role, membership.modulesJson),
    current: member.id === user.id,
  }));

  return (
    <SettingsShell
      businessId={businessId}
      title="Users & Access Control"
      description="Assign team members, administrator/standard roles, and module access permissions."
    >
      <UserAccessList businessId={businessId} users={rows} />
    </SettingsShell>
  );
}
