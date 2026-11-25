export type TrnValidationStatus = "empty" | "verified" | "format_only" | "invalid";

export interface TrnValidationResult {
  normalized: string;
  isEmpty: boolean;
  validFormat: boolean;
  validChecksum: boolean;
  status: TrnValidationStatus;
  message: string;
}

export function normalizeTrnInput(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[\s-]+/g, "").trim();
}

/**
 * Standard Luhn mod-10 check over a 15-digit UAE Tax Registration Number.
 */
export function passesUaeTrnLuhn(digits: string): boolean {
  if (!/^\d{15}$/.test(digits)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Computes a valid 15-digit UAE TRN given a 14-digit prefix.
 */
export function generateUaeTrnWithChecksum(prefix14: string): string {
  if (!/^\d{14}$/.test(prefix14)) {
    throw new Error("Prefix must be exactly 14 numeric digits");
  }
  for (let checkDigit = 0; checkDigit <= 9; checkDigit += 1) {
    const candidate = `${prefix14}${checkDigit}`;
    if (passesUaeTrnLuhn(candidate)) {
      return candidate;
    }
  }
  throw new Error("Unable to compute Luhn check digit");
}

/**
 * Validates UAE FTA 15-digit TRN format and Luhn mod-10 checksum.
 * UAE TRNs are 15 digits starting with "1" (typically "100...").
 */
export function validateUaeTrn(raw: string | null | undefined): TrnValidationResult {
  const normalized = normalizeTrnInput(raw);
  if (!normalized) {
    return {
      normalized: "",
      isEmpty: true,
      validFormat: false,
      validChecksum: false,
      status: "empty",
      message: "No TRN configured",
    };
  }

  const validFormat = /^1\d{14}$/.test(normalized);
  if (!validFormat) {
    return {
      normalized,
      isEmpty: false,
      validFormat: false,
      validChecksum: false,
      status: "invalid",
      message: "UAE TRN must be exactly 15 digits starting with 1",
    };
  }

  const validChecksum = passesUaeTrnLuhn(normalized);
  if (!validChecksum) {
    return {
      normalized,
      isEmpty: false,
      validFormat: true,
      validChecksum: false,
      status: "format_only",
      message: "15-digit format valid, but mod-10 check digit does not verify",
    };
  }

  return {
    normalized,
    isEmpty: false,
    validFormat: true,
    validChecksum: true,
    status: "verified",
    message: "15-digit UAE TRN format and check digit verified",
  };
}
