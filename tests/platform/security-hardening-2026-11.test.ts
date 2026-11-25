import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getSystemDb } from "../../src/core/db/system";
import { memberships, users } from "../../src/core/db/system-schema";
import { createBusiness, deleteBusiness } from "../../src/core/businesses/business-service";
import { isPrivateAddress, resolvePublicSmtpHost } from "../../src/modules/email/smtp-host-guard";
import { createFixedWindowLimiter } from "../../src/core/auth/rate-limiter";
import { requestPasswordResetAction } from "../../src/app/(auth)/reset-password/actions";

function seedUser(label: string) {
  const id = `${label}-${randomUUID().slice(0, 8)}`;
  getSystemDb()
    .insert(users)
    .values({
      id,
      name: label,
      email: `${id}@example.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      isSuperAdmin: false,
      status: "active",
      maxBusinesses: 5,
      maxUsers: 5,
      isTenantAdmin: true,
    })
    .run();
  return id;
}

test("SMTP guard rejects private, loopback, link-local and metadata addresses", async () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0"]) {
    assert.equal(isPrivateAddress(address), true, address);
    await assert.rejects(resolvePublicSmtpHost(address), /public mail server/, address);
  }
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
    assert.equal(isPrivateAddress(address), false, address);
  }
  await assert.rejects(resolvePublicSmtpHost("localhost"), /public mail server|could not be resolved/);
  const allowed = await resolvePublicSmtpHost("8.8.8.8");
  assert.deepEqual(allowed, { address: "8.8.8.8", servername: "8.8.8.8" });
});

test("only the owner can permanently delete a business", () => {
  const owner = seedUser("owner");
  const coAdmin = seedUser("co-admin");
  const business = createBusiness({ name: "Owner Only LLC", country: "AE", currency: "AED", financialYearStartMonth: 1 }, owner);
  getSystemDb()
    .insert(memberships)
    .values({ id: randomUUID(), businessId: business.id, userId: coAdmin, role: "administrator", modulesJson: "[]", createdAt: new Date().toISOString() })
    .run();

  assert.throws(() => deleteBusiness(business.id, coAdmin), /Only the business owner/);
  assert.doesNotThrow(() => deleteBusiness(business.id, owner));
});

test("fixed-window limiter allows the limit then blocks within the window", () => {
  const limiter = createFixedWindowLimiter({ windowMs: 60_000, max: 3 });
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.take("k")), [true, true, true, false]);
  assert.equal(limiter.take("other"), true, "keys are independent");
});

test("public reset requests are throttled per client", async () => {
  const results = [];
  for (let i = 0; i < 7; i++) {
    results.push(await requestPasswordResetAction(`flood-${i}-${randomUUID().slice(0, 4)}@example.test`));
  }
  assert.ok(results.slice(0, 5).every((result) => "success" in result && result.success));
  assert.ok(results.slice(5).every((result) => "error" in result && /Too many/.test(String(result.error))));
});
