import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/** Stable DOM id for a field's error message, used by `aria-describedby`. */
export function fieldErrorId(name: string) {
  return `${name.replace(/[^\w-]/g, "-")}-error`;
}

/**
 * Accessibility attributes for a form control: marks it invalid and links it
 * to its error message so screen readers announce the message with the field.
 */
export function fieldErrorProps(name: string, error: unknown) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? fieldErrorId(name) : undefined,
  } as const;
}

/**
 * Applies server-side validation errors (`{ field: [message, ...] }`) to a
 * react-hook-form instance and moves focus to the first invalid field.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: Record<string, string[] | string | undefined> | null | undefined,
) {
  let focusNext = true;
  for (const [field, messages] of Object.entries(fieldErrors ?? {})) {
    const message = Array.isArray(messages) ? messages[0] : messages;
    if (!message) continue;
    setError(field as Path<T>, { message }, { shouldFocus: focusNext });
    focusNext = false;
  }
}

/**
 * `onInvalid` handler for react-hook-form's `handleSubmit`: after the error
 * state renders, moves focus to the first control marked `aria-invalid` in the
 * submitted form (works for inputs, selects and combobox triggers alike).
 */
export function focusFirstInvalidField(_errors: unknown, event?: { target?: EventTarget | null }) {
  const form = event?.target instanceof HTMLElement ? event.target.closest("form") ?? event.target : null;
  const focus = () => {
    const root: ParentNode = form ?? document;
    const target = root.querySelector<HTMLElement>('[aria-invalid="true"]:not([disabled])');
    if (!target) return;
    target.focus();
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  if (typeof window !== "undefined") window.requestAnimationFrame(() => window.requestAnimationFrame(focus));
}
