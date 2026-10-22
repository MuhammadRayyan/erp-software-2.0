"use server";

export {
  toggleBusinessSuspensionAction,
  createTenantAction,
  updateTenantQuotasAction,
  toggleTenantSuspensionAction,
  resetTenantPasswordAction,
  type ActionResult as SuspensionActionResult,
} from "@/app/admin/actions";
