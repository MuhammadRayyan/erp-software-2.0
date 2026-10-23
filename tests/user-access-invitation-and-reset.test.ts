import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getSystemDb, getSystemSqlite } from "../src/core/db/system";
import {
  authAccounts,
  memberships,
  sessions,
  users,
  verifications,
} from "../src/core/db/system-schema";
import { createBusiness } from "../src/core/businesses/business-service";
import {
  createInvitationLinkForUser,
  createPasswordResetLinkForUser,
  inviteBusinessUser,
  listBusinessUsers,
  removeBusinessUser,
  resendInvitation,
  sendPasswordResetForUser,
  toggleUserSuspension,
  updateMembership,
} from "../src/core/permissions/membership-service";
import {
  completeInvitation,
  completePasswordReset,
  createPasswordResetToken,
  generateInvitationLink,
  verifyInvitationToken,
  verifyPasswordResetToken,
} from "../src/core/permissions/invitation-service";

import {
  sendAccessGrantedEmail,
  sendInvitationEmail,
  sendPasswordResetEmail,
} from "../src/modules/email/system-email-service";
import { canAccessModule, getBusinessAccess } from "../src/core/permissions/permissions";
import { requestPasswordResetAction } from "../src/app/(auth)/reset-password/actions";

test("User Access Control, Invitation Lifecycle, Password Reset & Email Suite", async (t) => {
  const db = getSystemDb();
  const sqlite = getSystemSqlite();

  const adminUserId = `admin-${randomUUID().slice(0, 8)}`;
  const adminEmail = `${adminUserId}@company.local`;
  const now = Date.now();

  // 1. Setup Admin Account
  sqlite.transaction(() => {
    db.insert(users)
      .values({
        id: adminUserId,
        name: "Workspace Admin",
        email: adminEmail,
        emailVerified: true,
        createdAt: new Date(now),
        updatedAt: new Date(now),
        isSuperAdmin: false,
        status: "active",
        maxBusinesses: 5,
        maxUsers: 10,
        isTenantAdmin: true,
      })
      .run();

    db.insert(authAccounts)
      .values({
        id: randomUUID(),
        accountId: adminUserId,
        providerId: "credential",
        userId: adminUserId,
        password: "hashedAdminPassword123!",
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      .run();
  })();

  const business = createBusiness(
    {
      name: "Global Technologies Corp",
      country: "AE",
      currency: "AED",
      financialYearStartMonth: 1,
    },
    adminUserId
  );
  const businessId = business.id;

  let inviteTokenSarah = "";
  let sarahUserId = "";
  const sarahEmail = `sarah.${randomUUID().slice(0, 6)}@testcorp.com`;

  // -------------------------------------------------------------
  // TEST 1: Invite New User with Email, Role, and Selected Modules
  // -------------------------------------------------------------
  await t.test("1. Invite New User: creates unverified user and returns setup link", async () => {
    const inviteRes = await inviteBusinessUser(businessId, adminUserId, {
      email: sarahEmail,
      role: "standard",
      modules: ["sales", "banking"],
    });

    assert.equal(inviteRes.status, "invited");
    assert.equal(inviteRes.email, sarahEmail);
    assert.ok(inviteRes.inviteUrl, "Must generate an invitation URL");
    assert.ok(inviteRes.inviteUrl.includes("/accept-invite?token="));

    sarahUserId = inviteRes.userId;

    // Verify user table entry
    const userRow = db.select().from(users).where(eq(users.id, sarahUserId)).get();
    assert.ok(userRow);
    assert.equal(userRow.emailVerified, false);
    assert.equal(userRow.status, "active");

    // Verify membership row
    const memberRow = db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, sarahUserId))
      .get();
    assert.ok(memberRow);
    assert.equal(memberRow.role, "standard");
    const parsedMods = JSON.parse(memberRow.modulesJson);
    assert.deepEqual(parsedMods, ["sales", "banking"]);

    // Verify invitation token in verification table
    const tokenMatch = inviteRes.inviteUrl.match(/token=([a-f0-9]+)/);
    assert.ok(tokenMatch, "Token must be extracted from URL");
    inviteTokenSarah = tokenMatch[1];

    const verRow = db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, `invite:${inviteTokenSarah}`))
      .get();
    assert.ok(verRow, "Verification row must exist in DB");
  });

  // -------------------------------------------------------------
  // TEST 2: Overview reflects 'invited' status
  // -------------------------------------------------------------
  await t.test("2. Overview list reflects status 'invited' for pending users", () => {
    const list = listBusinessUsers(businessId, adminUserId);
    const sarahEntry = list.find((u) => u.user.id === sarahUserId);
    assert.ok(sarahEntry);
    assert.equal(sarahEntry.invitationStatus, "invited");

    const adminEntry = list.find((u) => u.user.id === adminUserId);
    assert.ok(adminEntry);
    assert.equal(adminEntry.invitationStatus, "registered");
  });

  // -------------------------------------------------------------
  // TEST 3: Resend Invitation generates a fresh token and email
  // -------------------------------------------------------------
  await t.test("3. Resend Invitation: replaces token and dispatches new email", async () => {
    const resendRes = await resendInvitation(businessId, adminUserId, sarahUserId);
    assert.ok(resendRes.success);
    assert.ok(resendRes.inviteUrl);

    // Old token should be invalidated/replaced
    const oldVer = db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, `invite:${inviteTokenSarah}`))
      .get();
    assert.equal(oldVer, undefined, "Old token should be pruned");

    const newMatch = resendRes.inviteUrl.match(/token=([a-f0-9]+)/);
    assert.ok(newMatch);
    inviteTokenSarah = newMatch[1];

    const newVer = db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, `invite:${inviteTokenSarah}`))
      .get();
    assert.ok(newVer, "New token must exist");
  });

  // -------------------------------------------------------------
  // TEST 4: Accept Invitation / Complete Account Registration
  // -------------------------------------------------------------
  await t.test("4. Complete Registration: validates, sets password, marks verified", async () => {
    // 1. Verify token
    const tokenInfo = verifyInvitationToken(inviteTokenSarah);
    assert.ok(tokenInfo.valid);
    assert.equal(tokenInfo.data?.email, sarahEmail);
    assert.equal(tokenInfo.data?.businessName, "Global Technologies Corp");

    // 2. Reject weak password
    await assert.rejects(
      async () => {
        await completeInvitation(inviteTokenSarah, "Sarah Jenkins", "short");
      },
      /Password must be at least 8 characters long/
    );

    // 3. Complete successfully
    const completed = await completeInvitation(
      inviteTokenSarah,
      "Sarah Jenkins",
      "superSecurePass123!"
    );
    assert.equal(completed.name, "Sarah Jenkins");
    assert.equal(completed.email, sarahEmail);

    // 4. Verify DB state
    const updatedUser = db.select().from(users).where(eq(users.id, sarahUserId)).get();
    assert.equal(updatedUser?.name, "Sarah Jenkins");
    assert.equal(updatedUser?.emailVerified, true);
    assert.equal(updatedUser?.status, "active");

    const account = db.select().from(authAccounts).where(eq(authAccounts.userId, sarahUserId)).get();
    assert.ok(account);
    assert.ok(account.password);
    assert.notEqual(account.password, "superSecurePass123!"); // Must be hashed

    // 5. Token is consumed and cannot be reused
    const consumedToken = verifyInvitationToken(inviteTokenSarah);
    assert.equal(consumedToken.valid, false);

    // 6. Overview status transitions to 'registered'
    const list = listBusinessUsers(businessId, adminUserId);
    const sarahEntry = list.find((u) => u.user.id === sarahUserId);
    assert.equal(sarahEntry?.invitationStatus, "registered");
  });

  // -------------------------------------------------------------
  // TEST 5: Selective Module Access Enforcement
  // -------------------------------------------------------------
  await t.test("5. Selective Module Access: verified on server permissions", () => {
    assert.equal(canAccessModule(businessId, sarahUserId, "sales"), true);
    assert.equal(canAccessModule(businessId, sarahUserId, "banking"), true);
    assert.equal(canAccessModule(businessId, sarahUserId, "accounting"), false);
    assert.equal(canAccessModule(businessId, sarahUserId, "payroll"), false);
    assert.equal(canAccessModule(businessId, sarahUserId, "settings"), false);

    const access = getBusinessAccess(businessId, sarahUserId);
    assert.ok(access);
    assert.deepEqual(access.modules.sort(), ["banking", "sales"].sort());
  });

  // -------------------------------------------------------------
  // TEST 6: Inviting an Already Registered User into another Business
  // -------------------------------------------------------------
  await t.test("6. Invite Registered User: immediately adds with status 'registered'", async () => {
    const business2 = createBusiness(
      {
        name: "Branch Logistics Ltd",
        country: "AE",
        currency: "AED",
        financialYearStartMonth: 1,
      },
      adminUserId
    );

    const inviteRes = await inviteBusinessUser(business2.id, adminUserId, {
      email: sarahEmail,
      role: "administrator",
    });

    assert.equal(inviteRes.status, "registered");
    assert.equal(inviteRes.email, sarahEmail);

    const list2 = listBusinessUsers(business2.id, adminUserId);
    const sarahEntry2 = list2.find((u) => u.user.id === sarahUserId);
    assert.ok(sarahEntry2);
    assert.equal(sarahEntry2.invitationStatus, "registered");
    assert.equal(sarahEntry2.membership.role, "administrator");
  });

  // -------------------------------------------------------------
  // TEST 7: Send Password Reset Flow
  // -------------------------------------------------------------
  await t.test("7. Password Reset: admin dispatches reset link, user resets password", async () => {
    // 1. Admin triggers password reset
    const resetRes = await sendPasswordResetForUser(businessId, adminUserId, sarahUserId);
    assert.ok(resetRes.success);
    assert.ok(resetRes.resetUrl);

    const resetTokenMatch = resetRes.resetUrl.match(/token=([a-f0-9]+)/);
    assert.ok(resetTokenMatch);
    const resetToken = resetTokenMatch[1];

    // 2. User verifies reset token
    const tokenVerification = verifyPasswordResetToken(resetToken);
    assert.ok(tokenVerification.valid);
    assert.equal(tokenVerification.data?.email, sarahEmail);

    // 3. User creates a simulated active session
    const sessionId = randomUUID();
    db.insert(sessions)
      .values({
        id: sessionId,
        token: `session-token-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 1000000),
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: sarahUserId,
      })
      .run();

    assert.equal(
      db.select().from(sessions).where(eq(sessions.userId, sarahUserId)).all().length,
      1
    );

    // 4. User completes password reset
    const completeRes = await completePasswordReset(resetToken, "brandNewPassword2026#");
    assert.ok(completeRes.success);

    // 5. Existing sessions revoked
    assert.equal(
      db.select().from(sessions).where(eq(sessions.userId, sarahUserId)).all().length,
      0,
      "Sessions must be revoked on password reset"
    );

    // 6. Token is consumed
    assert.equal(verifyPasswordResetToken(resetToken).valid, false);

    // 7. Password hash updated
    const account = db.select().from(authAccounts).where(eq(authAccounts.userId, sarahUserId)).get();
    assert.ok(account?.password);
  });

  // -------------------------------------------------------------
  // TEST 8: Suspension and Reactivation Flow
  // -------------------------------------------------------------
  await t.test("8. Suspension & Reactivation: toggles status and enforces safeguards", () => {
    // Cannot suspend self
    assert.throws(
      () => {
        toggleUserSuspension(businessId, adminUserId, adminUserId, "suspended");
      },
      /You cannot suspend your own administrator account/
    );

    // Suspend Sarah
    const suspendRes = toggleUserSuspension(businessId, adminUserId, sarahUserId, "suspended");
    assert.equal(suspendRes.newStatus, "suspended");

    let list = listBusinessUsers(businessId, adminUserId);
    let sarahEntry = list.find((u) => u.user.id === sarahUserId);
    assert.equal(sarahEntry?.invitationStatus, "suspended");

    // Reactivate Sarah
    const reactivateRes = toggleUserSuspension(businessId, adminUserId, sarahUserId, "active");
    assert.equal(reactivateRes.newStatus, "active");

    list = listBusinessUsers(businessId, adminUserId);
    sarahEntry = list.find((u) => u.user.id === sarahUserId);
    assert.equal(sarahEntry?.invitationStatus, "registered");
  });

  // -------------------------------------------------------------
  // TEST 9: Remove Team Member
  // -------------------------------------------------------------
  await t.test("9. Remove User: removes membership and enforces self-removal guard", () => {
    const list = listBusinessUsers(businessId, adminUserId);
    const sarahEntry = list.find((u) => u.user.id === sarahUserId);
    assert.ok(sarahEntry);

    // Cannot remove own access
    const adminEntry = list.find((u) => u.user.id === adminUserId);
    assert.ok(adminEntry);
    assert.throws(
      () => {
        removeBusinessUser(businessId, adminUserId, adminEntry.membership.id);
      },
      /Use another administrator to remove your own access/
    );

    // Remove Sarah from business
    const removeRes = removeBusinessUser(businessId, adminUserId, sarahEntry.membership.id);
    assert.ok(removeRes.success);

    const afterList = listBusinessUsers(businessId, adminUserId);
    assert.equal(afterList.some((u) => u.user.id === sarahUserId), false);
  });

  // -------------------------------------------------------------
  // TEST 10: Email Dispatcher Verification
  // -------------------------------------------------------------
  await t.test("10. Email Dispatcher: renders templates and returns proper URLs", async () => {
    const inviteEmail = await sendInvitationEmail({
      to: "newcolleague@test.com",
      businessId,
      businessName: "Global Technologies Corp",
      inviterName: "Workspace Admin",
      inviteToken: "abc123xyz456",
    });
    assert.ok(inviteEmail.actionUrl.includes("/accept-invite?token=abc123xyz456"));
    assert.equal(inviteEmail.success, true);

    const resetEmail = await sendPasswordResetEmail({
      to: "forgotten@test.com",
      userName: "Forgotten User",
      resetToken: "reset999xyz",
      businessId,
    });
    assert.ok(resetEmail.actionUrl.includes("/reset-password?token=reset999xyz"));
    assert.equal(resetEmail.success, true);

    const accessEmail = await sendAccessGrantedEmail({
      to: "registered@test.com",
      userName: "Existing Member",
      businessId,
      businessName: "Global Technologies Corp",
      role: "Standard User",
    });
    assert.ok(accessEmail.actionUrl.includes(`/b/${businessId}/overview`));
    assert.equal(accessEmail.success, true);
  });

  // -------------------------------------------------------------
  // TEST 11: Removing unverified user B does NOT delete user A's token
  // -------------------------------------------------------------
  await t.test("11. Token Isolation: deleting unverified user B preserves user A's invite token", async () => {
    const userAEmail = `user.a.${randomUUID().slice(0, 6)}@testcorp.com`;
    const userBEmail = `user.b.${randomUUID().slice(0, 6)}@testcorp.com`;

    const inviteA = await inviteBusinessUser(businessId, adminUserId, { email: userAEmail });
    assert.ok(inviteA.inviteUrl);
    const tokenA = (inviteA.inviteUrl.match(/token=([a-f0-9]+)/) || [])[1];
    assert.ok(tokenA);

    const inviteB = await inviteBusinessUser(businessId, adminUserId, { email: userBEmail });
    assert.ok(inviteB.inviteUrl);
    const tokenB = (inviteB.inviteUrl.match(/token=([a-f0-9]+)/) || [])[1];
    assert.ok(tokenB);

    // Verify both tokens exist
    assert.equal(verifyInvitationToken(tokenA).valid, true);
    assert.equal(verifyInvitationToken(tokenB).valid, true);

    // Find user B membership
    const list = listBusinessUsers(businessId, adminUserId);
    const memberB = list.find((m) => m.user.email === userBEmail);
    assert.ok(memberB);

    // Remove user B (unverified stub cleanup)
    removeBusinessUser(businessId, adminUserId, memberB.membership.id);

    // User B's token should be cleaned up
    assert.equal(verifyInvitationToken(tokenB).valid, false);

    // User A's token MUST REMAIN VALID (proves no wildcard deletion)
    const verificationA = verifyInvitationToken(tokenA);
    assert.equal(verificationA.valid, true, "User A's invite token must not be deleted when User B is removed");
    assert.equal(verificationA.data?.email, userAEmail);

    // User A can still complete invitation
    const completeRes = await completeInvitation(tokenA, "User A Name", "ValidPassword123!");
    assert.equal(completeRes.email, userAEmail);
  });

  // -------------------------------------------------------------
  // TEST 12: Duplicate Invite Error Message Clarity
  // -------------------------------------------------------------
  await t.test("12. Duplicate Invite: provides specific pending invitation guidance", async () => {
    const pendingEmail = `pending.${randomUUID().slice(0, 6)}@testcorp.com`;
    await inviteBusinessUser(businessId, adminUserId, { email: pendingEmail });

    await assert.rejects(
      async () => {
        await inviteBusinessUser(businessId, adminUserId, { email: pendingEmail });
      },
      /pending invitation to this business\. You can resend their invitation from the team list/
    );
  });

  // -------------------------------------------------------------
  // TEST 13: Forgot Password Security & Anti-Enumeration
  // -------------------------------------------------------------
  await t.test("13. Forgot Password Security: never leaks resetUrl and prevents user enumeration", async () => {
    // 1. Registered user
    const resExisting = await requestPasswordResetAction(sarahEmail);
    assert.equal(resExisting.success, true);
    assert.equal((resExisting as any).resetUrl, undefined, "resetUrl must never be returned to unauthenticated caller");

    // 2. Non-existent user (identical response to prevent account enumeration)
    const resNonExistent = await requestPasswordResetAction("nonexistent.user.999@testcorp.com");
    assert.equal(resNonExistent.success, true);
    assert.equal((resNonExistent as any).resetUrl, undefined);

    // 3. Suspended user (does not leak suspension status)
    const suspendedEmail = `suspended.${randomUUID().slice(0, 6)}@testcorp.com`;
    const suspUser = await inviteBusinessUser(businessId, adminUserId, { email: suspendedEmail });
    toggleUserSuspension(businessId, adminUserId, suspUser.userId, "suspended");

    const resSuspended = await requestPasswordResetAction(suspendedEmail);
    assert.equal(resSuspended.success, true);
    assert.equal((resSuspended as any).resetUrl, undefined);
  });

  // -------------------------------------------------------------
  // TEST 14: Workspace Owner Safeguards
  // -------------------------------------------------------------
  await t.test("14. Workspace Owner Safeguards: Admin cannot demote, suspend, or remove the business owner", async () => {
    // 1. Check listBusinessUsers returns isOwner correctly
    const list = listBusinessUsers(businessId, adminUserId);
    const ownerEntry = list.find((u) => u.user.id === adminUserId);
    assert.ok(ownerEntry);
    assert.equal(ownerEntry.isOwner, true, "Admin is the business owner");

    // 2. Add an invited administrator
    const coAdminEmail = `coadmin.${randomUUID().slice(0, 6)}@testcorp.com`;
    const coAdminRes = await inviteBusinessUser(businessId, adminUserId, {
      email: coAdminEmail,
      role: "administrator",
    });
    const coAdminToken = (coAdminRes.inviteUrl?.match(/token=([a-f0-9]+)/) || [])[1];
    await completeInvitation(coAdminToken, "Co-Admin User", "coAdminPassword123!");

    const updatedList = listBusinessUsers(businessId, adminUserId);
    const coAdminEntry = updatedList.find((u) => u.user.id === coAdminRes.userId);
    assert.ok(coAdminEntry);
    assert.equal(coAdminEntry.isOwner, false, "Co-admin is not the owner");

    // 3. Co-admin attempts to demote owner to standard
    assert.throws(
      () => {
        updateMembership(businessId, coAdminRes.userId, ownerEntry.membership.id, "standard", ["sales"]);
      },
      /The business workspace owner must remain an administrator/
    );

    // 4. Co-admin attempts to suspend owner
    assert.throws(
      () => {
        toggleUserSuspension(businessId, coAdminRes.userId, adminUserId, "suspended");
      },
      /The business workspace owner cannot be suspended/
    );

    // 5. Co-admin attempts to remove owner from business
    assert.throws(
      () => {
        removeBusinessUser(businessId, coAdminRes.userId, ownerEntry.membership.id);
      },
      /The business workspace owner cannot be removed/
    );
  });

  // -------------------------------------------------------------
  // TEST 15: Suspended Account Safeguards
  // -------------------------------------------------------------
  await t.test("15. Suspended User Safeguards: Suspended users cannot verify or complete password reset and reset does not un-suspend", async () => {
    const victimEmail = `victim.${randomUUID().slice(0, 6)}@testcorp.com`;
    const victimInvite = await inviteBusinessUser(businessId, adminUserId, { email: victimEmail });
    const victimToken = (victimInvite.inviteUrl?.match(/token=([a-f0-9]+)/) || [])[1];
    await completeInvitation(victimToken, "Victim User", "victimPassword123!");

    // Generate password reset token while active
    const { token: resetToken } = createPasswordResetToken(victimEmail, businessId);

    // Now administrator suspends the account
    toggleUserSuspension(businessId, adminUserId, victimInvite.userId, "suspended");

    // Suspended user attempts to verify reset token
    const tokenCheck = verifyPasswordResetToken(resetToken);
    assert.equal(tokenCheck.valid, false);
    assert.ok(tokenCheck.error?.includes("suspended"));

    // Suspended user attempts to complete password reset
    await assert.rejects(
      async () => {
        await completePasswordReset(resetToken, "hackedNewPassword123#");
      },
      /suspended/
    );

    // Verify account remains suspended
    const userRow = db.select().from(users).where(eq(users.id, victimInvite.userId)).get();
    assert.equal(userRow?.status, "suspended", "Account must remain suspended");

    // Suspended user attempts to verify invitation link
    const invLink = generateInvitationLink(victimInvite.userId, businessId, victimEmail);
    const invToken = (invLink.match(/token=([a-f0-9]+)/) || [])[1];
    const invCheck = verifyInvitationToken(invToken);
    assert.equal(invCheck.valid, false);
    assert.ok(invCheck.error?.includes("suspended"));
  });

  // -------------------------------------------------------------
  // TEST 16: Direct Link Creation Without Email
  // -------------------------------------------------------------
  await t.test("16. Direct Link Creation without Email: create direct link returns active URL without email delivery", async () => {
    const directEmail = `direct.${randomUUID().slice(0, 6)}@testcorp.com`;
    const inviteRes = await inviteBusinessUser(businessId, adminUserId, {
      email: directEmail,
      role: "standard",
      sendEmail: false,
    });

    assert.equal(inviteRes.status, "invited");
    assert.ok(inviteRes.inviteUrl);
    assert.ok(inviteRes.inviteUrl.includes("/accept-invite?token="));

    // Token is fully valid and usable
    const token = (inviteRes.inviteUrl.match(/token=([a-f0-9]+)/) || [])[1];
    const verified = verifyInvitationToken(token);
    assert.equal(verified.valid, true);
    assert.equal(verified.data?.email, directEmail);
  });

  // -------------------------------------------------------------
  // TEST 17: Direct Link Generation for Existing Users
  // -------------------------------------------------------------
  await t.test("17. Direct Action Links: createInvitationLinkForUser and createPasswordResetLinkForUser generate valid URLs", async () => {
    const linkUserEmail = `linkuser.${randomUUID().slice(0, 6)}@testcorp.com`;
    const memberRes = await inviteBusinessUser(businessId, adminUserId, {
      email: linkUserEmail,
      sendEmail: false,
    });

    // 1. Create setup link for pending user
    const invLinkRes = createInvitationLinkForUser(businessId, adminUserId, memberRes.userId);
    assert.ok(invLinkRes.success);
    assert.ok(invLinkRes.inviteUrl);

    // Complete setup
    const token = (invLinkRes.inviteUrl.match(/token=([a-f0-9]+)/) || [])[1];
    await completeInvitation(token, "Link User", "linkUserPassword123!");

    // 2. Cannot create invitation link for registered user
    assert.throws(
      () => {
        createInvitationLinkForUser(businessId, adminUserId, memberRes.userId);
      },
      /already completed account setup/
    );

    // 3. Create password reset link for registered user
    const resetLinkRes = createPasswordResetLinkForUser(businessId, adminUserId, memberRes.userId);
    assert.ok(resetLinkRes.success);
    assert.ok(resetLinkRes.resetUrl.includes("/reset-password?token="));

    const resetToken = (resetLinkRes.resetUrl.match(/token=([a-f0-9]+)/) || [])[1];
    const resetVerified = verifyPasswordResetToken(resetToken);
    assert.equal(resetVerified.valid, true);
    assert.equal(resetVerified.data?.email, linkUserEmail);
  });

  // -------------------------------------------------------------
  // TEST 18: Resend Invitation Guard for Registered Users
  // -------------------------------------------------------------
  await t.test("18. Resend Invitation Guard: rejects for registered users and preserves registered status", async () => {
    const regEmail = `registered.user.${randomUUID().slice(0, 6)}@testcorp.com`;
    const regRes = await inviteBusinessUser(businessId, adminUserId, { email: regEmail });
    const regToken = (regRes.inviteUrl?.match(/token=([a-f0-9]+)/) || [])[1];
    await completeInvitation(regToken, "Registered User", "strongPass1234#");

    // Resend must reject because user is already registered
    await assert.rejects(
      async () => {
        await resendInvitation(businessId, adminUserId, regRes.userId);
      },
      /already completed account setup/
    );

    // Status in overview must remain 'registered'
    const list = listBusinessUsers(businessId, adminUserId);
    const entry = list.find((u) => u.user.id === regRes.userId);
    assert.equal(entry?.invitationStatus, "registered");
  });
});

