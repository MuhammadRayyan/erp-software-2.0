import { cache } from "react";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { closeBusinessConnection, openBusinessDatabase } from "@/core/db/business";
import { getBusinessPaths } from "@/core/db/paths";
import { businesses, memberships } from "@/core/db/system-schema";
import { getSystemDb } from "@/core/db/system";
import { businessInputSchema, type BusinessInput } from "./business-input";
import { synchronizeBusinessBaseCurrency } from "@/modules/currency/exchange-rate";

export function listBusinessesForUser(userId: string, includeArchived = false) {
  const conditions = [eq(memberships.userId, userId)];
  if (!includeArchived) conditions.push(eq(businesses.archived, false));
  return getSystemDb()
    .select({ business: businesses, membership: memberships })
    .from(businesses)
    .innerJoin(memberships, eq(memberships.businessId, businesses.id))
    .where(and(...conditions))
    .orderBy(desc(businesses.lastOpenedAt), businesses.name)
    .all();
}

export const getBusinessForUser = cache((businessId: string, userId: string) => {
  return getSystemDb()
    .select({ business: businesses, membership: memberships })
    .from(businesses)
    .innerJoin(
      memberships,
      and(eq(memberships.businessId, businesses.id), eq(memberships.userId, userId)),
    )
    .where(eq(businesses.id, businessId))
    .get();
});

export function createBusiness(input: BusinessInput, userId: string) {
  const data = businessInputSchema.parse(input);
  const id = randomUUID();
  const directoryKey = randomUUID();
  const now = new Date().toISOString();
  const paths = getBusinessPaths(directoryKey);

  try {
    const context = openBusinessDatabase(directoryKey);
    getSystemDb().transaction((tx) => {
      tx.insert(businesses)
        .values({
          id,
          name: data.name,
          country: data.country,
          currency: data.currency,
          financialYearStartMonth: data.financialYearStartMonth,
          directoryKey,
          archived: false,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
        })
        .run();
      tx.insert(memberships)
        .values({
          id: randomUUID(),
          businessId: id,
          userId,
          role: "administrator",
          modulesJson: "[]",
          createdAt: now,
        })
        .run();
    });
    synchronizeBusinessBaseCurrency(context.sqlite, data.currency);
  } catch (error) {
    closeBusinessConnection(directoryKey);
    rmSync(paths.directory, { recursive: true, force: true });
    throw error;
  }

  return { id, directoryKey };
}

export function touchBusiness(businessId: string, userId: string) {
  if (!getBusinessForUser(businessId, userId)) throw new Error("BUSINESS_ACCESS_DENIED");
  getSystemDb()
    .update(businesses)
    .set({ lastOpenedAt: new Date().toISOString() })
    .where(eq(businesses.id, businessId))
    .run();
}

export function renameBusiness(businessId: string, userId: string, name: string) {
  const access = getBusinessForUser(businessId, userId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  const nextName = z.string().trim().min(2).max(100).parse(name);
  getSystemDb()
    .update(businesses)
    .set({ name: nextName, updatedAt: new Date().toISOString() })
    .where(eq(businesses.id, businessId))
    .run();
}

export function archiveBusiness(businessId: string, userId: string) {
  const access = getBusinessForUser(businessId, userId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  getSystemDb()
    .update(businesses)
    .set({ archived: true, updatedAt: new Date().toISOString() })
    .where(eq(businesses.id, businessId))
    .run();
}

export function deleteBusiness(businessId: string, userId: string) {
  const access = getBusinessForUser(businessId, userId);
  if (!access || access.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  const paths = getBusinessPaths(access.business.directoryKey);
  closeBusinessConnection(access.business.directoryKey);
  getSystemDb().delete(businesses).where(eq(businesses.id, businessId)).run();
  rmSync(paths.directory, { recursive: true, force: true });
}
