import { convertToBase, proportionalCarryingRelease } from "./conversion";
import type { RateSnapshot } from "./validation";

export type SettlementAllocation = {
  foreignAmountAllocated: number;
  baseCarryingAmountReleased: number;
  settlementBaseAmount: number;
  realizedFxAmount: number;
};

export function calculateSettlementAllocation(input: {
  foreignAmountAllocated: number;
  foreignOpenBefore: number;
  baseCarryingBefore: number;
  rate: RateSnapshot;
}): SettlementAllocation {
  const baseCarryingAmountReleased = proportionalCarryingRelease(
    input.foreignAmountAllocated,
    input.foreignOpenBefore,
    input.baseCarryingBefore,
  );
  const settlementBaseAmount = convertToBase(
    input.foreignAmountAllocated,
    input.rate.currencyMinorUnit,
    input.rate.baseMinorUnit,
    input.rate.exchangeRateToBase,
  );
  return {
    foreignAmountAllocated: input.foreignAmountAllocated,
    baseCarryingAmountReleased,
    settlementBaseAmount,
    realizedFxAmount: settlementBaseAmount - baseCarryingAmountReleased,
  };
}

