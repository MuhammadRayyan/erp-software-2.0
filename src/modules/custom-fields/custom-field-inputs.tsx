"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import type { CustomFieldFieldType } from "./custom-field-input";

// Definition shape rendered inside the customer/supplier/document forms.
export type CustomFieldInputDefinition = {
  id: string;
  name: string;
  fieldType: CustomFieldFieldType;
  selectOptions: string[];
  isRequired: boolean;
};

// Grid of custom field controls. Values are managed by the parent form as a
// single Record<definitionId, string> state ("true"/"false" for checkboxes).
export function CustomFieldInputs({
  definitions,
  values,
  onChange,
  className,
}: {
  definitions: CustomFieldInputDefinition[];
  values: Record<string, string>;
  onChange: (definitionId: string, value: string) => void;
  className?: string;
  checkboxClassName?: string;
}) {
  return (
    <div className={className ?? "mt-4 grid gap-4 sm:grid-cols-2"}>
      {definitions.map((definition) => {
        const value = values[definition.id] ?? "";
        if (definition.fieldType === "checkbox") {
          return (
            <div className="space-y-1.5" key={definition.id}>
              <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium leading-none">
                <Checkbox
                  id={`custom-field-${definition.id}`}
                  checked={value === "true"}
                  onCheckedChange={(checked) =>
                    onChange(definition.id, Boolean(checked) ? "true" : "false")
                  }
                />
                <span>{definition.name}</span>
              </label>
            </div>
          );
        }
        return (
          <div className="space-y-1.5" key={definition.id}>
            <Label htmlFor={`custom-field-${definition.id}`}>
              {definition.name}
              {!definition.isRequired && (
                <span className="font-normal text-muted-foreground"> (optional)</span>
              )}
            </Label>
            {definition.fieldType === "select" ? (
              <SelectNative
                id={`custom-field-${definition.id}`}
                value={value}
                onChange={(event) => onChange(definition.id, event.target.value)}
              >
                <option value=""></option>
                {definition.selectOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectNative>
            ) : (
              <Input
                id={`custom-field-${definition.id}`}
                type={definition.fieldType === "date" ? "date" : "text"}
                inputMode={definition.fieldType === "number" ? "decimal" : undefined}
                value={value}
                onChange={(event) => onChange(definition.id, event.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
