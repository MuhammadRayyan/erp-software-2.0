"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInputSavePermission, requirePermission } from "@/core/permissions/require-module";
import {
  saveEmployee,
  toggleEmployeeActive,
  savePayslipItem,
  savePayslip,
  postPayslipToLedger,
  voidPayslip,
  generateBatchPayslips,
} from "../services/payroll-service";
import { runBatch, type BatchActionResult } from "@/modules/shared/batch";
import { postGratuityAccrual, reverseGratuityAccrual } from "../services/gratuity-accrual-service";
import { getBusinessDb } from "@/core/db/business";

export type ActionResult<T = unknown> = {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
};

const employeeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Employee name is required"),
  code: z.string().optional().nullable(),
  email: z.string().email("Invalid email address").optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  joiningDate: z.string().optional().nullable(),
  basicSalaryMinor: z.number().int().min(0).optional().nullable(),
  housingAllowanceMinor: z.number().int().min(0).optional().nullable(),
  transportAllowanceMinor: z.number().int().min(0).optional().nullable(),
  otherAllowancesMinor: z.number().int().min(0).optional().nullable(),
  molPersonId: z.string().trim().max(30).optional().nullable(),
  bankRoutingCode: z.string().trim().max(20).optional().nullable(),
  iban: z.string().trim().max(40).optional().nullable(),
  wpsEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const payslipItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Item name is required"),
  type: z.enum(["earnings", "deduction"]),
  accountId: z.string().min(1, "Chart of accounts mapping is required"),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  position: z.number().int().optional(),
});

const payslipLineSchema = z.object({
  id: z.string().optional(),
  itemId: z.string().optional().nullable(),
  type: z.enum(["earnings", "deduction"]),
  description: z.string().min(1, "Line description is required"),
  accountId: z.string().min(1, "Account is required"),
  amountMinor: z.number().int().min(0, "Amount must be positive"),
  position: z.number().int().optional(),
});

const payslipSchema = z.object({
  id: z.string().optional(),
  payslipNumber: z.string().optional(),
  employeeId: z.string().min(1, "Employee is required"),
  date: z.string().min(1, "Date is required"),
  periodDescription: z.string().optional().nullable(),
  documentStatus: z.enum(["draft", "posted", "void"]).optional(),
  notes: z.string().optional().nullable(),
  lines: z.array(payslipLineSchema).min(1, "At least one line is required"),
  autoPost: z.boolean().optional(),
});

const batchPayRunSchema = z.object({
  periodDate: z.string().min(1, "Period date is required"),
  periodDescription: z.string().min(1, "Period description is required"),
  employeeIds: z.array(z.string()).optional(),
  autoPost: z.boolean().optional(),
});

export async function saveEmployeeAction(
  businessId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireInputSavePermission(businessId, "payroll", input);
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const id = saveEmployee(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/payroll/employees`);
    return { success: true, data: { id } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save employee.";
    return { error: message };
  }
}

export async function toggleEmployeeActiveAction(
  businessId: string,
  employeeId: string,
  isActive: boolean
): Promise<ActionResult> {
  const { user } = await requirePermission(businessId, "payroll", "edit");
  try {
    toggleEmployeeActive(businessId, user.id, employeeId, isActive);
    revalidatePath(`/b/${businessId}/payroll/employees`);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update employee status.";
    return { error: message };
  }
}

export async function savePayslipItemAction(
  businessId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireInputSavePermission(businessId, "payroll", input);
  const parsed = payslipItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const id = savePayslipItem(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/payroll/items`);
    return { success: true, data: { id } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save payslip item.";
    return { error: message };
  }
}

export async function savePayslipAction(
  businessId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireInputSavePermission(businessId, "payroll", input);
  const parsed = payslipSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let payslipId: string;
  try {
    payslipId = savePayslip(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/payroll/payslips`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save payslip.";
    return { error: message };
  }

  redirect(`/b/${businessId}/payroll/payslips/${payslipId}`);
}

export async function postPayslipAction(
  businessId: string,
  payslipId: string
): Promise<ActionResult> {
  const { user } = await requirePermission(businessId, "payroll", "post");
  try {
    postPayslipToLedger(businessId, user.id, payslipId);
    revalidatePath(`/b/${businessId}/payroll/payslips/${payslipId}`);
    revalidatePath(`/b/${businessId}/payroll/payslips`);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to post payslip to ledger.";
    return { error: message };
  }
}

export async function voidPayslipAction(
  businessId: string,
  payslipId: string
): Promise<ActionResult> {
  const { user } = await requirePermission(businessId, "payroll", "delete");
  try {
    voidPayslip(businessId, user.id, payslipId);
    revalidatePath(`/b/${businessId}/payroll/payslips/${payslipId}`);
    revalidatePath(`/b/${businessId}/payroll/payslips`);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to void payslip.";
    return { error: message };
  }
}

export async function generateBatchPayslipsAction(
  businessId: string,
  input: unknown
): Promise<ActionResult<{ createdCount: number }>> {
  const { user } = await requireInputSavePermission(businessId, "payroll", input);
  const parsed = batchPayRunSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Please fill in all required fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const result = generateBatchPayslips(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/payroll/payslips`);
    return { success: true, data: { createdCount: result.createdCount } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate batch payslips.";
    return { error: message };
  }
}

function payslipNumber(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const query = sqlite.prepare("SELECT payslip_number AS n FROM payslips WHERE id = ?");
  return (id: string) => (query.get(id) as { n: string } | undefined)?.n;
}

export async function batchPostPayslipsAction(businessId: string, ids: string[]): Promise<BatchActionResult> {
  const { user } = await requirePermission(businessId, "payroll", "post");
  const result = runBatch(ids, (id) => postPayslipToLedger(businessId, user.id, id), payslipNumber(businessId, user.id));
  revalidatePath(`/b/${businessId}/payroll/payslips`);
  return result;
}

export async function batchVoidPayslipsAction(businessId: string, ids: string[]): Promise<BatchActionResult> {
  const { user } = await requirePermission(businessId, "payroll", "delete");
  const result = runBatch(ids, (id) => voidPayslip(businessId, user.id, id), payslipNumber(businessId, user.id));
  revalidatePath(`/b/${businessId}/payroll/payslips`);
  return result;
}

const gratuityPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month.");

export async function postGratuityAccrualAction(
  businessId: string,
  period: string,
): Promise<ActionResult<{ totalAmountMinor: number; employeeCount: number; replaced: boolean }>> {
  const { user } = await requirePermission(businessId, "payroll", "post");
  const parsed = gratuityPeriodSchema.safeParse(period);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose a month." };
  try {
    const result = postGratuityAccrual(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/payroll/gratuity`);
    return { success: true, data: { totalAmountMinor: result.totalAmountMinor, employeeCount: result.employeeCount, replaced: result.replaced } };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to post the gratuity accrual." };
  }
}

export async function reverseGratuityAccrualAction(businessId: string, period: string): Promise<ActionResult> {
  const { user } = await requirePermission(businessId, "payroll", "delete");
  const parsed = gratuityPeriodSchema.safeParse(period);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose a month." };
  try {
    reverseGratuityAccrual(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/payroll/gratuity`);
    return { success: true };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to reverse the gratuity accrual." };
  }
}
