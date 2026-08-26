import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

broken_setup = """  const adminId = "admin-user";
  const business = createBusiness(
    {
      name: "Phase 10 Test Business",
      currencyCode: "AED",
      businessType: "saas",
      country: "AE",
    },
    adminId,
  );
  const businessId = business.id;
  migrateBusinessDatabase(getBusinessDb(businessId, adminId).db);
  const { customerId, standardAccount, outputVatId } = seedDemoData(businessId, adminId);
  const sqlite = getBusinessDb(businessId, adminId).db;"""

fixed_setup = """  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const sqlite = getBusinessDb(businessId, adminId).db;
  
  const customerId = sqlite.prepare("SELECT id FROM customers LIMIT 1").get().id;
  const standardAccount = sqlite.prepare("SELECT id FROM chart_of_accounts LIMIT 1").get().id;
  const outputVatId = sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get().id;
"""

c = c.replace(broken_setup, fixed_setup)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
