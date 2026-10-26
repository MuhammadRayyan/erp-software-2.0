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
  const { user } = await requirePermission(businessId, "payroll", "create");
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
