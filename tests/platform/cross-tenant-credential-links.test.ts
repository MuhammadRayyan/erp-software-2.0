import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getSystemDb, getSystemSqlite } from "../../src/core/db/system";
import { authAccounts, users } from "../../src/core/db/system-schema";
import { createBusiness } from "../../src/core/businesses/business-service";
import {
  createAndAddBusinessUser,
  createInvitationLinkForUser,
  createPasswordResetLinkForUser,
  inviteBusinessUser,
  resendInvitation,
  sendPasswordResetForUser,
} from "../../src/core/permissions/membership-service";

function seedUser(label: string, options: { withPassword?: boolean; isSuperAdmin?: boolean } = {}) {
  const db = getSystemDb();
  const id = `${label}-${randomUUID().slice(0, 8)}`;
  const now = new Date();
  getSystemSqlite().transaction(() => {
    db.insert(users)
      .values({
        id,
        name: label,
        email: `${id}@example.test`,
        emailVerified: Boolean(options.withPassword),
        createdAt: now,
        updatedAt: now,
        isSuperAdmin: Boolean(options.isSuperAdmin),
        status: "active",
        maxBusinesses: 3,
        maxUsers: 10,
        isTenantAdmin: true,
      })
      .run();
    if (options.withPassword) {
      db.insert(authAccounts)
        .values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: "hashed", createdAt: now, updatedAt: now })
        .run();
    }
  })();
  return { id, email: `${id}@example.test` };
}

const businessInput = (name: string) => ({ name, country: "AE", currency: "AED", financialYearStartMonth: 1 });

test("an admin cannot obtain credential links for accounts outside their business", async (t) => {
  const victim = seedUser("victim", { withPassword: true });
  const victimBusiness = createBusiness(businessInput("Victim Trading LLC"), victim.id);
  const attacker = seedUser("attacker", { withPassword: true });
  const attackerBusiness = createBusiness(businessInput("Attacker Trading LLC"), attacker.id);

  await t.test("adding another tenant's owner never returns a usable link", async () => {
    const invited = await inviteBusinessUser(attackerBusiness.id, attacker.id, { email: victim.email, sendEmail: false });
    assert.notEqual(invited.status, "invited");
    assert.ok(!invited.inviteUrl?.includes("token="), "no credential token handed to the admin");

    assert.throws(
      () => createPasswordResetLinkForUser(attackerBusiness.id, attacker.id, victim.id),
      /other businesses/,
    );
    const emailed = await sendPasswordResetForUser(attackerBusiness.id, attacker.id, victim.id);
    assert.equal(emailed.resetUrl, undefined, "reset link goes only to the victim's mailbox");
  });

  await t.test("a pending invitee of another business cannot be claimed through a second invite", async () => {
    const pending = await inviteBusinessUser(victimBusiness.id, victim.id, { email: `pending-${randomUUID().slice(0, 6)}@example.test`, sendEmail: false });
    assert.match(pending.inviteUrl ?? "", /token=/, "home business still gets its own invite link");

    const reinvited = await inviteBusinessUser(attackerBusiness.id, attacker.id, { email: pending.email, sendEmail: false });
    assert.equal(reinvited.inviteUrl, undefined);
    assert.throws(() => createInvitationLinkForUser(attackerBusiness.id, attacker.id, pending.userId), /other businesses/);
    const resent = await resendInvitation(attackerBusiness.id, attacker.id, pending.userId);
    assert.equal(resent.inviteUrl, undefined);
  });

  await t.test("accounts managed only by this business still get direct links", async () => {
    const staff = await createAndAddBusinessUser(attackerBusiness.id, attacker.id, {
      name: "Staff Member",
      email: `staff-${randomUUID().slice(0, 6)}@example.test`,
      password: "Sufficient-Password-1",
    });
    const link = createPasswordResetLinkForUser(attackerBusiness.id, attacker.id, staff.userId);
    assert.match(link.resetUrl, /token=/);
    const emailed = await sendPasswordResetForUser(attackerBusiness.id, attacker.id, staff.userId);
    assert.ok(emailed.resetUrl);
  });

  await t.test("super-admins keep direct links for support", () => {
    const superAdmin = seedUser("root", { withPassword: true, isSuperAdmin: true });
    const victimAdminView = createPasswordResetLinkForUser(attackerBusiness.id, superAdmin.id, victim.id);
    assert.match(victimAdminView.resetUrl, /token=/);
  });
});
