import type { z } from "zod";

/**
 * Formats Zod validation issues into indexed field error paths (e.g. `lines.0.taxCodeId`),
 * allowing nested array and object errors to be bound directly to specific form inputs
 * and table cells without error flattening.
 */
export function formatZodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }
    fieldErrors[path].push(issue.message);
  }
  return fieldErrors;
}
