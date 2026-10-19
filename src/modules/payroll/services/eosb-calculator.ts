export interface EosbCalculationInput {
  joiningDate: string; // YYYY-MM-DD
  terminationDate: string; // YYYY-MM-DD
  basicSalaryMinor: number; // in minor units (fils), e.g. 10,000 AED = 1,000,000
  unpaidLeaveDays?: number;
  unusedLeaveDays?: number;
}

export interface EosbCalculationResult {
  joiningDate: string;
  terminationDate: string;
  basicSalaryMinor: number;
  unpaidLeaveDays: number;
  unusedLeaveDays: number;
  totalCalendarDays: number;
  netServiceDays: number;
  yearsOfService: number; // fractional e.g. 3.25
  durationSummary: {
    years: number;
    months: number;
    days: number;
    formatted: string;
  };
  dailyWageMinor: number;
  eligibleForGratuity: boolean;
  gratuityTier1Minor: number; // First 5 years portion
  gratuityTier2Minor: number; // Beyond 5 years portion
  uncappedGratuityMinor: number;
  maxCapMinor: number; // 24 months basic salary
  isCapped: boolean;
  gratuityMinor: number;
  leaveEncashmentMinor: number;
  totalSettlementMinor: number;
}

/**
 * Calculates UAE End of Service Benefits (EOSB) pursuant to
 * UAE Federal Decree-Law No. 33 of 2021 (Article 51 Gratuity & Article 29 Leave Encashment).
 *
 * Rules:
 * 1. Daily Wage = Basic Salary / 30.
 * 2. Service under 1 year (< 365 net days) = 0 AED gratuity.
 * 3. 1 to 5 years of service = 21 days' basic wage for each year (pro-rata for partial years).
 * 4. More than 5 years of service = 30 days' basic wage for each year exceeding 5 years.
 * 5. Maximum statutory cap = 2 years' (24 months) basic wage.
 * 6. Leave encashment = unused leave days * daily wage.
 */
export function calculateUaeEosb(input: EosbCalculationInput): EosbCalculationResult {
  const jMatch = input.joiningDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const tMatch = input.terminationDate.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!jMatch || !tMatch) {
    throw new Error("Invalid joining date or termination date format (expected YYYY-MM-DD).");
  }

  const jYear = parseInt(jMatch[1], 10);
  const jMonth = parseInt(jMatch[2], 10);
  const jDay = parseInt(jMatch[3], 10);

  const tYear = parseInt(tMatch[1], 10);
  const tMonth = parseInt(tMatch[2], 10);
  const tDay = parseInt(tMatch[3], 10);

  const joiningUtc = Date.UTC(jYear, jMonth - 1, jDay);
  const terminationUtc = Date.UTC(tYear, tMonth - 1, tDay);

  if (isNaN(joiningUtc) || isNaN(terminationUtc)) {
    throw new Error("Invalid joining date or termination date.");
  }
  if (terminationUtc < joiningUtc) {
    throw new Error("Termination date cannot be before joining date.");
  }

  const basicSalaryMinor = Math.max(0, Math.round(input.basicSalaryMinor));
  const unpaidLeaveDays = Math.max(0, Math.round(input.unpaidLeaveDays ?? 0));
  const unusedLeaveDays = Math.max(0, Math.round(input.unusedLeaveDays ?? 0));

  // Calendar days difference (inclusive of start and end date)
  const msDiff = terminationUtc - joiningUtc;
  const totalCalendarDays = Math.floor(msDiff / (1000 * 60 * 60 * 24)) + 1;

  // Net service days excluding unpaid leave days (Article 51 clause 4)
  const netServiceDays = Math.max(0, totalCalendarDays - unpaidLeaveDays);

  // Exact service duration breakdown using calendar math
  let years = tYear - jYear;
  let months = tMonth - jMonth;
  let days = tDay - jDay;

  if (days < 0) {
    months -= 1;
    // Days in previous month
    const prevMonthLastDay = new Date(Date.UTC(tYear, tMonth - 1, 0)).getUTCDate();
    days += prevMonthLastDay;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  // Fractional years for calculation: 365 days per year
  const yearsOfService = Number((netServiceDays / 365).toFixed(4));
  const dailyWageMinor = Math.round(basicSalaryMinor / 30);

  let eligibleForGratuity = false;
  let gratuityTier1Minor = 0;
  let gratuityTier2Minor = 0;
  let uncappedGratuityMinor = 0;

  // Minimum 1 year of continuous service (Article 51 clause 2)
  if (netServiceDays >= 365 && basicSalaryMinor > 0) {
    eligibleForGratuity = true;
    const daysInFirst5 = Math.min(netServiceDays, 5 * 365);
    const daysOver5 = Math.max(0, netServiceDays - 5 * 365);

    // 21 days' basic wage per year for first 5 years
    gratuityTier1Minor = Math.round((daysInFirst5 / 365) * 21 * dailyWageMinor);

    // 30 days' basic wage per year beyond 5 years
    if (daysOver5 > 0) {
      gratuityTier2Minor = Math.round((daysOver5 / 365) * 30 * dailyWageMinor);
    }

    uncappedGratuityMinor = gratuityTier1Minor + gratuityTier2Minor;
  }

  // Statutory maximum cap: 24 months basic salary (Article 51 clause 5)
  const maxCapMinor = basicSalaryMinor * 24;
  const isCapped = uncappedGratuityMinor > maxCapMinor;
  const gratuityMinor = isCapped ? maxCapMinor : uncappedGratuityMinor;

  // Article 29: Leave Encashment on basic wage
  const leaveEncashmentMinor = Math.round(unusedLeaveDays * dailyWageMinor);

  // Total final settlement
  const totalSettlementMinor = gratuityMinor + leaveEncashmentMinor;

  const durationParts: string[] = [];
  if (years > 0) durationParts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months > 0) durationParts.push(`${months} ${months === 1 ? "month" : "months"}`);
  if (days > 0 || durationParts.length === 0) durationParts.push(`${days} ${days === 1 ? "day" : "days"}`);

  return {
    joiningDate: input.joiningDate,
    terminationDate: input.terminationDate,
    basicSalaryMinor,
    unpaidLeaveDays,
    unusedLeaveDays,
    totalCalendarDays,
    netServiceDays,
    yearsOfService,
    durationSummary: {
      years,
      months,
      days,
      formatted: durationParts.join(", "),
    },
    dailyWageMinor,
    eligibleForGratuity,
    gratuityTier1Minor,
    gratuityTier2Minor,
    uncappedGratuityMinor,
    maxCapMinor,
    isCapped,
    gratuityMinor,
    leaveEncashmentMinor,
    totalSettlementMinor,
  };
}
