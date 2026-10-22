import { cache } from "react";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { closeBusinessConnection, getBusinessDb, openBusinessDatabase } from "@/core/db/business";
import { getBusinessPaths } from "@/core/db/paths";
import { businesses, memberships, userBusinessPreferences } from "@/core/db/system-schema";
import { getSystemDb } from "@/core/db/system";
import { businessInputSchema, type BusinessInput } from "./business-input";
import { synchronizeBusinessBaseCurrency } from "@/modules/currency/exchange-rate";
import { listInvoices } from "@/modules/sales-invoices/invoice-service";

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
    // Include archived = false to be consistent with getBusinessAccess and getBusinessDb.
    // Without this, touchBusiness (and any other caller) could interact with an archived business.
    .where(and(eq(businesses.id, businessId), eq(businesses.archived, false)))
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
          status: "active",
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

const touchCache = new Map<string, number>();
const TOUCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function touchBusiness(businessId: string, userId: string) {
  const now = Date.now();
  const lastTouch = touchCache.get(businessId) || 0;
  if (now - lastTouch < TOUCH_INTERVAL_MS) return;

  if (!getBusinessForUser(businessId, userId)) throw new Error("BUSINESS_ACCESS_DENIED");
  
  getSystemDb()
    .update(businesses)
    .set({ lastOpenedAt: new Date(now).toISOString() })
    .where(eq(businesses.id, businessId))
    .run();
    
  touchCache.set(businessId, now);
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

export type BusinessQuickKpis = {
  liquidBalanceMinor: number;
  outstandingReceivablesMinor: number;
  overdueCount: number;
  overdueMinor: number;
  activeEmployeesCount: number;
};

export function getBusinessQuickKpis(businessId: string, userId: string): BusinessQuickKpis {
  try {
    const { sqlite } = getBusinessDb(businessId, userId);

    // 1. Bank & Cash balance from posted journal lines
    let liquidBalanceMinor = 0;
    try {
      const bankRow = sqlite
        .prepare(`
          SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance_minor
          FROM journal_lines jl
          INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
          INNER JOIN accounts a ON a.id = jl.account_id
          WHERE a.subtype IN ('bank', 'cash')
        `)
        .get() as { balance_minor: number } | undefined;
      liquidBalanceMinor = bankRow?.balance_minor ?? 0;
    } catch {
      liquidBalanceMinor = 0;
    }

    // 2. Open / Outstanding Receivables and Overdue Invoices
    let outstandingReceivablesMinor = 0;
    let overdueCount = 0;
    let overdueMinor = 0;
    try {
      const invList = listInvoices(businessId, userId).filter(
        (inv) => inv.documentStatus === "posted" && inv.baseBalanceMinor > 0,
      );
      for (const inv of invList) {
        outstandingReceivablesMinor += inv.baseBalanceMinor;
        if (inv.paymentStatus === "overdue") {
          overdueCount++;
          overdueMinor += inv.baseBalanceMinor;
        }
      }
    } catch {
      // fallback
    }

    // 3. Active Employees count
    let activeEmployeesCount = 0;
    try {
      const empRow = sqlite
        .prepare(`SELECT COUNT(*) as c FROM employees WHERE is_active = 1`)
        .get() as { c: number } | undefined;
      activeEmployeesCount = empRow?.c ?? 0;
    } catch {
      activeEmployeesCount = 0;
    }

    return {
      liquidBalanceMinor,
      outstandingReceivablesMinor,
      overdueCount,
      overdueMinor,
      activeEmployeesCount,
    };
  } catch {
    return {
      liquidBalanceMinor: 0,
      outstandingReceivablesMinor: 0,
      overdueCount: 0,
      overdueMinor: 0,
      activeEmployeesCount: 0,
    };
  }
}

export function getPinnedBusinessIdsForUser(userId: string): Set<string> {
  try {
    const rows = getSystemDb()
      .select({ businessId: userBusinessPreferences.businessId, value: userBusinessPreferences.value })
      .from(userBusinessPreferences)
      .where(
        and(
          eq(userBusinessPreferences.userId, userId),
          eq(userBusinessPreferences.key, "business.pinned"),
        ),
      )
      .all();
    return new Set(rows.filter((r) => r.value === "true").map((r) => r.businessId));
  } catch {
    return new Set();
  }
}

export function setBusinessPinned(businessId: string, userId: string, pinned: boolean): void {
  const access = getBusinessForUser(businessId, userId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");

  const db = getSystemDb();
  if (pinned) {
    db.insert(userBusinessPreferences)
      .values({
        userId,
        businessId,
        key: "business.pinned",
        value: "true",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userBusinessPreferences.userId, userBusinessPreferences.businessId, userBusinessPreferences.key],
        set: { value: "true", updatedAt: new Date() },
      })
      .run();
  } else {
    db.delete(userBusinessPreferences)
      .where(
        and(
          eq(userBusinessPreferences.userId, userId),
          eq(userBusinessPreferences.businessId, businessId),
          eq(userBusinessPreferences.key, "business.pinned"),
        ),
      )
      .run();
  }
}

