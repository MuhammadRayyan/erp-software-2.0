const MONEY_SCALE = 100n;
const QUANTITY_SCALE = 10_000n;
const BASIS_POINT_SCALE = 10_000n;

function parseScaledDecimal(value: string, decimals: number, label: string) {
  const normalized = value.trim();
  const pattern = new RegExp(`^\\d{1,12}(?:\\.\\d{1,${decimals}})?$`);
  if (!pattern.test(normalized)) {
    throw new Error(`${label} must be a positive number with up to ${decimals} decimal places.`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(`${whole}${fraction.padEnd(decimals, "0")}`);
}

function toSafeNumber(value: bigint, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${label} is too large.`);
  return number;
}

function divideAndRound(value: bigint, divisor: bigint) {
  return (value + divisor / 2n) / divisor;
}

export function parseMoneyToMinor(value: string, label = "Amount") {
  return toSafeNumber(parseScaledDecimal(value, 2, label), label);
}

export function parseSignedMoneyToMinor(value: string, label = "Amount") {
  const normalized = value.trim();
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const minor = toSafeNumber(parseScaledDecimal(unsigned, 2, label), label);
  return negative ? -minor : minor;
}

export function minorToInput(minor: number) {
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function parseQuantityToMicros(value: string) {
  return toSafeNumber(parseScaledDecimal(value, 4, "Quantity"), "Quantity");
}

export function quantityMicrosToInput(quantityMicros: number) {
  const whole = Math.floor(quantityMicros / 10_000);
  const fraction = String(quantityMicros % 10_000).padStart(4, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function multiplyMoneyByQuantity(unitPriceMinor: number, quantityMicros: number) {
  if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor < 0) {
    throw new Error("Unit price must be a valid non-negative amount.");
  }
  if (!Number.isSafeInteger(quantityMicros) || quantityMicros <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }
  return toSafeNumber(
    divideAndRound(BigInt(unitPriceMinor) * BigInt(quantityMicros), QUANTITY_SCALE),
    "Line amount",
  );
}

export function calculateTax(netMinor: number, rateBasisPoints: number) {
  if (!Number.isSafeInteger(netMinor) || netMinor < 0) throw new Error("Net amount is invalid.");
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 10_000) {
    throw new Error("Tax rate is invalid.");
  }
  return toSafeNumber(
    divideAndRound(BigInt(netMinor) * BigInt(rateBasisPoints), BASIS_POINT_SCALE),
    "Tax amount",
  );
}

export function splitTaxInclusive(grossMinor: number, rateBasisPoints: number) {
  if (!Number.isSafeInteger(grossMinor) || grossMinor <= 0) throw new Error("Gross amount is invalid.");
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 10_000) {
    throw new Error("Tax rate is invalid.");
  }
  const divisor = BASIS_POINT_SCALE + BigInt(rateBasisPoints);
  const netMinor = toSafeNumber(
    divideAndRound(BigInt(grossMinor) * BASIS_POINT_SCALE, divisor),
    "Net amount",
  );
  return { netMinor, taxMinor: grossMinor - netMinor };
}

export function addMinor(values: number[]) {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  return toSafeNumber(total, "Total");
}

export function calculateDiscount(
  amountMinor: number,
  discountType: "none" | "percentage" | "fixed",
  discountValue: string,
  minorUnit: number
) {
  if (discountType === "none") return 0;
  if (discountType === "fixed") {
    const parsed = parseScaledDecimal(discountValue, minorUnit, "Discount amount");
    const minor = toSafeNumber(parsed, "Discount amount");
    return Math.min(minor, amountMinor); // Cannot discount more than the amount
  }
  if (discountType === "percentage") {
    const percent = parseFloat(discountValue);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      throw new Error("Invalid discount percentage.");
    }
    const percentScale = 10_000n; // 100.00%
    const rateBasisPoints = BigInt(Math.round(percent * 100));
    return toSafeNumber(
      divideAndRound(BigInt(amountMinor) * rateBasisPoints, percentScale),
      "Discount amount"
    );
  }
  return 0;
}

export function rateBasisPointsToPercent(rateBasisPoints: number) {
  const value = rateBasisPoints / Number(MONEY_SCALE);
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");
}
