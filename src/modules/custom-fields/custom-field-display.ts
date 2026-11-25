import type { CustomFieldFieldType } from "./custom-field-input";

// Slim definition shape shared by list tables and detail views.
export type CustomFieldColumn = {
  id: string;
  name: string;
  fieldType: CustomFieldFieldType;
  selectOptions: string[];
};

// Render a stored custom field value for display. Checkboxes render as
// Yes/No (a stored "false" is still an answer); anything else renders the
// stored string, with an em dash for empty or missing values.
export function formatCustomFieldValue(fieldType: CustomFieldFieldType, value: string | undefined): string {
  if (fieldType === "checkbox") {
    if (value === undefined) return "—";
    return value === "true" ? "Yes" : "No";
  }
  const raw = value ?? "";
  return raw === "" ? "—" : raw;
}

// Returns the name of the first required definition without a value, or null
// when every required custom field is filled. Used for client-side submit
// blocking (the service re-validates server-side).
export function firstMissingRequiredCustomField(
  definitions: { id: string; name: string; fieldType: CustomFieldFieldType; isRequired: boolean }[],
  values: Record<string, string>,
): string | null {
  for (const definition of definitions) {
    if (!definition.isRequired) continue;
    if ((values[definition.id] ?? "").trim() === "") return definition.name;
  }
  return null;
}

/**
 * Builds the baseline map of custom field values for a form.
 */
export function buildInitialCustomFieldValues(
  definitions: { id: string; fieldType: CustomFieldFieldType }[],
  storedValues?: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const definition of definitions) {
    result[definition.id] =
      storedValues?.[definition.id] ?? (definition.fieldType === "checkbox" ? "false" : "");
  }
  return result;
}

/**
 * Compares current custom field values against the baseline map so forms track
 * unsaved edits made outside `react-hook-form`.
 */
export function haveCustomFieldValuesChanged(
  initialValues: Record<string, string>,
  currentValues: Record<string, string>,
): boolean {
  const keys = new Set([...Object.keys(initialValues), ...Object.keys(currentValues)]);
  for (const key of keys) {
    if ((initialValues[key] ?? "") !== (currentValues[key] ?? "")) {
      return true;
    }
  }
  return false;
}
