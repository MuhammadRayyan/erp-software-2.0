/**
 * Shared look for text-like form controls (Input, Textarea, SelectNative,
 * Combobox trigger, search fields). Borders use the `--input` token, which
 * meets WCAG 1.4.11 (≥3:1 against the control background) in both themes;
 * focus shows a primary border plus a visible ring.
 */
export const controlSurface =
  "rounded-[6px] border border-input bg-surface-raised text-foreground shadow-[0_1px_1px_rgb(15_23_42/0.03)] outline-none transition-colors";

export const controlFocus = "focus:border-primary focus:ring-2 focus:ring-ring/50";
export const controlFocusVisible = "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50";
export const controlFocusWithin = "focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/50";

export const controlInvalid =
  "aria-invalid:border-danger aria-invalid:bg-danger/[0.03] aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/40";
export const controlInvalidVisible =
  "aria-invalid:border-danger aria-invalid:bg-danger/[0.03] aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger/40";

export const controlDisabled = "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70";

/** Full class set for an `<input>` / `<textarea>`-style control. */
export const textControl = [controlSurface, "placeholder:text-muted-foreground", controlFocus, controlInvalid, controlDisabled].join(" ");
