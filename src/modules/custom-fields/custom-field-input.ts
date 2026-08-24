import { z } from "zod";

export const customFieldEntityTypes = ["customer", "supplier", "sales_invoice"] as const;
export const customFieldFieldTypes = ["text", "number", "date", "select", "checkbox"] as const;

export type CustomFieldEntityType = (typeof customFieldEntityTypes)[number];
export type CustomFieldFieldType = (typeof customFieldFieldTypes)[number];

const selectOptionSchema = z
  .string()
  .trim()
  .min(1, "Options cannot be empty")
  .max(60, "Each option must be 60 characters or fewer");

export const customFieldDefinitionSchema = z
  .object({
    entityType: z.enum(customFieldEntityTypes),
    name: z.string().trim().min(1, "Enter a field name").max(60),
    fieldType: z.enum(customFieldFieldTypes),
    selectOptions: z.array(selectOptionSchema).max(20, "A select field can have at most 20 options").default([]),
    position: z.number().int().min(0).optional().default(0),
    isRequired: z.boolean().optional().default(false),
    showInList: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.fieldType === "select") {
      if (data.selectOptions.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["selectOptions"],
          message: "Add at least one option for a select field",
        });
      }
      const seen = new Set<string>();
      for (const option of data.selectOptions) {
        if (seen.has(option)) {
          ctx.addIssue({
            code: "custom",
            path: ["selectOptions"],
            message: `Duplicate option "${option}"`,
          });
        }
        seen.add(option);
      }
    } else if (data.selectOptions.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["selectOptions"],
        message: "Options are only allowed for select fields",
      });
    }
  });

export type CustomFieldDefinitionInput = z.input<typeof customFieldDefinitionSchema>;
export type CustomFieldDefinitionData = z.output<typeof customFieldDefinitionSchema>;

// Values are stored as strings: checkbox serializes "true"/"false", numbers as
// decimal strings, dates as YYYY-MM-DD, selects as the chosen option ("" = none).
export const customFieldValueSchema = z.string();

export type CustomFieldValue = string;
