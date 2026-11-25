import { fieldErrorId } from "@/lib/form-errors";

/**
 * Inline validation message for one field. Its id matches the control's
 * `aria-describedby` (see `fieldErrorProps`).
 */
export function FieldError({ name, message }: { name: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={fieldErrorId(name)} className="field-error" role="alert">
      {message}
    </p>
  );
}
