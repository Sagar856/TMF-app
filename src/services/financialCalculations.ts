/**
 * Precision Financial Calculation Engine for Personal Finance
 * Handles EMI calculations, amortization schedules, investment valuations,
 * fixed deposit compounding, and partial/full redemption cost-basis allocation.
 */

import { todayLocalISO, addMonthsClamped } from '../utils/dates';

export type RepaymentFrequency = 'Monthly' | 'Quarterly' | 'Yearly';

export const MONTHS_PER_PERIOD: Record<RepaymentFrequency, number> = {
  Monthly: 1,
  Quarterly: 3,
  Yearly: 12,
};

export interface EmiCalculationParams {
  principal: number; // Financed amount (after discount and down payment)
  annualInterestRate: number; // in percentage, e.g., 10.5 for 10.5%
  tenureMonths: number;
  loanStructure?: 'standard_emi' | 'no_cost_emi' | 'down_payment_emi' | 'interest_only' | 'peer_loan' | 'peer_lend';
  emiOverride?: number;
  startDate?: string;
  firstInstallmentDate?: string;
  /** Upfront fee paid at disbursal; added to the total cost of borrowing, not amortised. */
  processingFees?: number;
  /** How often an installment is due. Defaults to Monthly. */
  repaymentFrequency?: RepaymentFrequency;
}

export interface AmortizationInstallment {
  installmentNumber: number;
  dueDate: string;
  emiAmount: number;
  principalComponent: number;
  interestComponent: number;
  outstandingBalance: number;
  status: 'scheduled' | 'pending_confirmation' | 'paid' | 'overdue' | 'skipped' | 'cancelled';
  paidDate?: string;
  transactionId?: string;
  confirmedAt?: string;
  skippedAt?: string;
  notes?: string;
}

export interface AmortizationScheduleResult {
  /** Installment amount per period (named for backwards compatibility; equals the periodic EMI). */
  monthlyEmi: number;
  calculatedEmi: number;
  isOverridden: boolean;
  emiDifference: number;
  financedPrincipal: number;
  totalInterestPayable: number;
  /** Principal + interest + processing fees. */
  totalRepaymentAmount: number;
  processingFees: number;
  repaymentFrequency: RepaymentFrequency;
  /** Number of installments in the schedule. */
  periods: number;
  schedule: AmortizationInstallment[];
}

/**
 * Rounds a number to exactly two decimal places using financial round-half-up
 */
export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Reducing-balance EMI formula for an arbitrary period:
 * EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 * where r = annualRate / (periodsPerYear * 100) and n = number of periods.
 */
export function calculatePeriodicEMI(
  principal: number,
  annualRate: number,
  periods: number,
  periodsPerYear: number
): number {
  if (!isFiniteNonNegative(principal) || principal <= 0 || !Number.isFinite(periods) || periods <= 0) return 0;
  if (!Number.isFinite(annualRate) || annualRate <= 0) {
    return roundCurrency(principal / periods);
  }

  const r = annualRate / (periodsPerYear * 100);
  const factor = Math.pow(1 + r, periods);
  const emi = (principal * r * factor) / (factor - 1);
  return roundCurrency(emi);
}

/**
 * Standard monthly reducing-balance EMI.
 */
export function calculateStandardEMI(principal: number, annualRate: number, tenureMonths: number): number {
  return calculatePeriodicEMI(principal, annualRate, tenureMonths, 12);
}

/**
 * Generates an accurate, period-by-period amortization schedule with exact rounding
 * and final installment reconciliation. Supports monthly, quarterly and yearly
 * repayment frequencies; the last period absorbs any partial-period remainder.
 */
export function generateAmortizationSchedule(params: EmiCalculationParams): AmortizationScheduleResult {
  const {
    principal: rawPrincipal,
    annualInterestRate: rawRate,
    tenureMonths: rawTenure,
    loanStructure = 'standard_emi',
    emiOverride,
    firstInstallmentDate = todayLocalISO(),
    processingFees: rawFees = 0,
    repaymentFrequency = 'Monthly',
  } = params;

  const principal = isFiniteNonNegative(rawPrincipal) ? rawPrincipal : 0;
  const annualInterestRate = isFiniteNonNegative(rawRate) ? rawRate : 0;
  const tenureMonths = Number.isFinite(rawTenure) ? Math.floor(rawTenure) : 0;
  const processingFees = isFiniteNonNegative(rawFees) ? roundCurrency(rawFees) : 0;
  const monthsPerPeriod = MONTHS_PER_PERIOD[repaymentFrequency] ?? 1;
  const periodsPerYear = 12 / monthsPerPeriod;
  const periods = Math.ceil(tenureMonths / monthsPerPeriod);

  if (principal <= 0 || periods <= 0) {
    return {
      monthlyEmi: 0,
      calculatedEmi: 0,
      isOverridden: false,
      emiDifference: 0,
      financedPrincipal: principal,
      totalInterestPayable: 0,
      totalRepaymentAmount: processingFees,
      processingFees,
      repaymentFrequency,
      periods: 0,
      schedule: [],
    };
  }

  const periodRate = annualInterestRate / (periodsPerYear * 100);
  const isZeroInterest = loanStructure === 'no_cost_emi' || annualInterestRate <= 0;

  // Calculate theoretical EMI per period
  let theoreticalEmi = 0;
  if (isZeroInterest) {
    // In No-cost EMI, customer pays zero interest
    theoreticalEmi = roundCurrency(principal / periods);
  } else if (loanStructure === 'interest_only') {
    // Interest only payment each period, principal lump sum at the end
    theoreticalEmi = roundCurrency(principal * periodRate);
  } else {
    theoreticalEmi = calculatePeriodicEMI(principal, annualInterestRate, periods, periodsPerYear);
  }

  // An override is only honoured when it is finite, positive, and at least covers
  // the first period's interest — otherwise principal would go negative.
  const minViableEmi = isZeroInterest ? 0 : roundCurrency(principal * periodRate) + 0.01;
  const overrideIsViable =
    typeof emiOverride === 'number' && Number.isFinite(emiOverride) && emiOverride > 0 && emiOverride >= minViableEmi;
  const effectiveEmi = overrideIsViable ? roundCurrency(emiOverride as number) : theoreticalEmi;
  const isOverridden = overrideIsViable && Math.abs((emiOverride as number) - theoreticalEmi) > 0.01;
  const emiDifference = isOverridden ? roundCurrency(effectiveEmi - theoreticalEmi) : 0;

  const schedule: AmortizationInstallment[] = [];
  let remainingPrincipal = principal;
  let totalInterest = 0;

  for (let i = 1; i <= periods; i++) {
    // Advance by whole periods with day clamping (e.g. Jan 31 -> Feb 28 -> Mar 31)
    const dueDateStr = addMonthsClamped(firstInstallmentDate, (i - 1) * monthsPerPeriod);

    let interestComponent = 0;
    let principalComponent = 0;
    let currentEmi = effectiveEmi;

    if (isZeroInterest) {
      interestComponent = 0;
      if (i === periods) {
        principalComponent = remainingPrincipal;
        currentEmi = principalComponent;
      } else {
        principalComponent = Math.min(remainingPrincipal, roundCurrency(effectiveEmi));
        currentEmi = principalComponent;
      }
    } else if (loanStructure === 'interest_only') {
      interestComponent = roundCurrency(remainingPrincipal * periodRate);
      if (i === periods) {
        principalComponent = remainingPrincipal;
        currentEmi = roundCurrency(interestComponent + principalComponent);
      } else {
        principalComponent = 0;
        currentEmi = interestComponent;
      }
    } else {
      // Standard reducing balance
      interestComponent = roundCurrency(remainingPrincipal * periodRate);

      if (i === periods) {
        // Final installment reconciles any rounding discrepancies
        principalComponent = remainingPrincipal;
        currentEmi = roundCurrency(principalComponent + interestComponent);
      } else {
        principalComponent = roundCurrency(effectiveEmi - interestComponent);
        if (principalComponent > remainingPrincipal) {
          principalComponent = remainingPrincipal;
          currentEmi = roundCurrency(principalComponent + interestComponent);
        }
      }
    }

    remainingPrincipal = roundCurrency(Math.max(0, remainingPrincipal - principalComponent));
    totalInterest = roundCurrency(totalInterest + interestComponent);

    schedule.push({
      installmentNumber: i,
      dueDate: dueDateStr,
      emiAmount: currentEmi,
      principalComponent,
      interestComponent,
      outstandingBalance: remainingPrincipal,
      status: 'scheduled',
    });

    // An over-sized override can retire the loan early; stop emitting zero installments.
    if (remainingPrincipal <= 0 && i < periods) break;
  }

  const scheduledTotal = roundCurrency(schedule.reduce((sum, s) => sum + s.emiAmount, 0));
  const totalRepayment = roundCurrency(scheduledTotal + processingFees);

  return {
    monthlyEmi: effectiveEmi,
    calculatedEmi: theoreticalEmi,
    isOverridden,
    emiDifference,
    financedPrincipal: principal,
    totalInterestPayable: totalInterest,
    totalRepaymentAmount: totalRepayment,
    processingFees,
    repaymentFrequency,
    periods: schedule.length,
    schedule,
  };
}

/* =========================================================================
   Fixed Deposit Calculations
   ========================================================================= */

export interface FdCalculationParams {
  principal: number;
  annualInterestRate: number; // e.g. 7.25%
  depositDate: string; // YYYY-MM-DD
  maturityDate?: string;
  tenureMonths?: number;
  compoundingFrequency?: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'simple';
  payoutFrequency?: 'monthly' | 'quarterly' | 'at_maturity';
  prematurePenaltyPercent?: number; // e.g. 1.0% penalty
  currentDate?: string; // date up to which to calculate accrued interest
}

export interface FdCalculationResult {
  principal: number;
  totalMaturityAmount: number;
  totalInterestAtMaturity: number;
  accruedInterestToDate: number;
  currentRealizableValue: number;
  prematurePenaltyAmount: number;
  tenureDays: number;
  daysElapsed: number;
  effectiveAnnualYield: number;
  /** For periodic-payout (non-cumulative) deposits: interest paid out each period. */
  periodicPayout: number;
  /** Number of payouts already due up to currentDate. */
  payoutsToDate: number;
  /** Interest already paid out (periodic) — not part of maturity amount. */
  interestPaidOutToDate: number;
  /** False when inputs are invalid (bad dates, maturity before deposit, negative rate…). */
  isValid: boolean;
  validationError?: string;
}

const EMPTY_FD_RESULT: FdCalculationResult = {
  principal: 0,
  totalMaturityAmount: 0,
  totalInterestAtMaturity: 0,
  accruedInterestToDate: 0,
  currentRealizableValue: 0,
  prematurePenaltyAmount: 0,
  tenureDays: 0,
  daysElapsed: 0,
  effectiveAnnualYield: 0,
  periodicPayout: 0,
  payoutsToDate: 0,
  interestPaidOutToDate: 0,
  isValid: false,
};

function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

export function calculateFixedDeposit(params: FdCalculationParams): FdCalculationResult {
  const {
    principal,
    annualInterestRate,
    depositDate,
    maturityDate,
    tenureMonths = 12,
    compoundingFrequency = 'quarterly',
    payoutFrequency = 'at_maturity',
    prematurePenaltyPercent = 1.0,
    currentDate = todayLocalISO(),
  } = params;

  if (!Number.isFinite(principal) || principal <= 0) {
    return { ...EMPTY_FD_RESULT, validationError: 'Principal must be greater than zero.' };
  }
  if (!Number.isFinite(annualInterestRate) || annualInterestRate < 0 || annualInterestRate > 100) {
    return { ...EMPTY_FD_RESULT, principal, validationError: 'Interest rate must be between 0 and 100%.' };
  }
  if (!Number.isFinite(tenureMonths) || tenureMonths <= 0) {
    return { ...EMPTY_FD_RESULT, principal, validationError: 'Tenure must be at least 1 month.' };
  }

  const depDate = parseIsoDate(depositDate);
  if (!depDate) return { ...EMPTY_FD_RESULT, principal, validationError: 'Deposit date is invalid.' };
  const matDate = maturityDate ? parseIsoDate(maturityDate) : parseIsoDate(addMonthsClamped(depositDate, Math.round(tenureMonths)));
  if (!matDate) return { ...EMPTY_FD_RESULT, principal, validationError: 'Maturity date is invalid.' };
  if (matDate.getTime() <= depDate.getTime()) {
    return { ...EMPTY_FD_RESULT, principal, validationError: 'Maturity date must be after the deposit date.' };
  }
  const now = parseIsoDate(currentDate) || new Date();

  const msPerDay = 1000 * 60 * 60 * 24;
  const tenureDays = Math.max(1, Math.round((matDate.getTime() - depDate.getTime()) / msPerDay));
  const daysElapsed = Math.max(0, Math.min(tenureDays, Math.round((now.getTime() - depDate.getTime()) / msPerDay)));

  const yearsTotal = tenureDays / 365;
  const yearsElapsed = daysElapsed / 365;

  let compN = 4; // quarterly default in Indian and international banking
  if (compoundingFrequency === 'monthly') compN = 12;
  else if (compoundingFrequency === 'quarterly') compN = 4;
  else if (compoundingFrequency === 'half_yearly') compN = 2;
  else if (compoundingFrequency === 'yearly') compN = 1;

  const r = annualInterestRate / 100;

  // Periodic payout (non-cumulative) deposits pay interest out each period, so
  // interest never compounds and the maturity amount is just the principal.
  // Payout counts use calendar months so the 1st-of-month payout isn't missed
  // by day/365 rounding.
  const isPeriodicPayout = payoutFrequency === 'monthly' || payoutFrequency === 'quarterly';
  const payoutsPerYear = payoutFrequency === 'monthly' ? 12 : payoutFrequency === 'quarterly' ? 4 : 0;
  const monthsPerPayout = payoutFrequency === 'monthly' ? 1 : 3;
  const wholeMonthsBetween = (from: Date, to: Date) => {
    const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    return Math.max(0, to.getDate() < from.getDate() ? months - 1 : months);
  };
  const periodicPayout = isPeriodicPayout ? roundCurrency((principal * r) / payoutsPerYear) : 0;
  const totalPayouts = isPeriodicPayout ? Math.floor(wholeMonthsBetween(depDate, matDate) / monthsPerPayout) : 0;
  const payoutsToDate = isPeriodicPayout ? Math.min(totalPayouts, Math.floor(wholeMonthsBetween(depDate, now) / monthsPerPayout)) : 0;
  const interestPaidOutToDate = roundCurrency(periodicPayout * payoutsToDate);

  let totalMaturityAmount = 0;
  let totalInterestAtMaturity = 0;

  if (isPeriodicPayout) {
    totalInterestAtMaturity = roundCurrency(principal * r * yearsTotal);
    totalMaturityAmount = roundCurrency(principal); // interest already paid out along the way
  } else if (compoundingFrequency === 'simple') {
    totalInterestAtMaturity = roundCurrency(principal * r * yearsTotal);
    totalMaturityAmount = roundCurrency(principal + totalInterestAtMaturity);
  } else {
    // Compound interest: A = P * (1 + r/n)^(n * t)
    totalMaturityAmount = roundCurrency(principal * Math.pow(1 + r / compN, compN * yearsTotal));
    totalInterestAtMaturity = roundCurrency(totalMaturityAmount - principal);
  }

  // Accrued interest to current date (for periodic payout: interest earned but not yet paid in the current period)
  let accruedInterestToDate = 0;
  if (isPeriodicPayout) {
    accruedInterestToDate = roundCurrency(Math.max(0, principal * r * yearsElapsed - interestPaidOutToDate));
  } else if (compoundingFrequency === 'simple') {
    accruedInterestToDate = roundCurrency(principal * r * yearsElapsed);
  } else {
    const valueNow = principal * Math.pow(1 + r / compN, compN * yearsElapsed);
    accruedInterestToDate = roundCurrency(Math.max(0, valueNow - principal));
  }

  // Premature withdrawal calculation (applies penalty on interest rate)
  const penaltyRate = Math.max(0, r - (prematurePenaltyPercent / 100));
  let prematureValueNow = principal;
  if (isPeriodicPayout || compoundingFrequency === 'simple') {
    prematureValueNow = roundCurrency(principal + principal * penaltyRate * yearsElapsed - interestPaidOutToDate);
  } else {
    prematureValueNow = roundCurrency(principal * Math.pow(1 + penaltyRate / compN, compN * yearsElapsed));
  }

  const prematurePenaltyAmount = roundCurrency(Math.max(0, (principal + accruedInterestToDate) - prematureValueNow));
  const currentRealizableValue = roundCurrency(principal + accruedInterestToDate - prematurePenaltyAmount);

  const effectiveYield = yearsTotal > 0 ? roundCurrency((totalInterestAtMaturity / (principal * yearsTotal)) * 100) : annualInterestRate;

  return {
    principal,
    totalMaturityAmount,
    totalInterestAtMaturity,
    accruedInterestToDate,
    currentRealizableValue,
    prematurePenaltyAmount,
    tenureDays,
    daysElapsed,
    effectiveAnnualYield: effectiveYield,
    periodicPayout,
    payoutsToDate,
    interestPaidOutToDate,
    isValid: true,
  };
}

/* =========================================================================
   Redemption Engine (Full & Partial)
   ========================================================================= */

export interface RedemptionLot {
  id: string;
  date: string;
  shares: number;
  purchasePrice: number;
  brokerageFees?: number;
}

export interface RedemptionCalculationParams {
  totalUnitsOrShares: number;
  totalCostBasis: number;
  unitsOrSharesToRedeem: number;
  redemptionPrice: number; // NAV or price per share or FD maturity value
  chargesAmount?: number; // Exit load / Brokerage / Penalty
  taxRatePercent?: number; // STCG / LTCG / TDS %
  isFixedDeposit?: boolean;
  /** Purchase lots; when provided, cost basis is consumed FIFO (oldest lot first). */
  lots?: RedemptionLot[];
  /** Redemption date (YYYY-MM-DD) used to compute holding period per consumed lot. */
  redemptionDate?: string;
  /** Holding period (days) at or above which a lot counts as long-term. Default 365. */
  longTermDays?: number;
}

export interface ConsumedLot {
  lotId: string;
  date: string;
  shares: number;
  purchasePrice: number;
  costBasis: number;
  proceeds: number;
  gain: number;
  holdingDays: number;
  isLongTerm: boolean;
}

export interface RedemptionCalculationResult {
  unitsOrSharesRedeemed: number;
  remainingUnitsOrShares: number;
  redemptionPrice: number;
  grossProceeds: number;
  charges: number;
  taxes: number;
  netCreditedAmount: number;
  allocatedCostBasis: number;
  remainingCostBasis: number;
  realizedProfitLoss: number;
  isFullRedemption: boolean;
  /** FIFO detail when lots were supplied. */
  consumedLots?: ConsumedLot[];
  remainingLots?: RedemptionLot[];
  shortTermGain?: number;
  longTermGain?: number;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/**
 * Consumes purchase lots oldest-first for a sale of `quantity` shares/units.
 * Lot cost basis includes any brokerage recorded on that lot.
 */
export function consumeLotsFifo(
  lots: RedemptionLot[],
  quantity: number,
  redemptionPrice: number,
  redemptionDate: string = todayLocalISO(),
  longTermDays: number = 365
): { consumed: ConsumedLot[]; remaining: RedemptionLot[]; costBasis: number } {
  const sorted = [...lots]
    .filter((l) => Number.isFinite(l.shares) && l.shares > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  let toSell = Math.max(0, quantity);
  const consumed: ConsumedLot[] = [];
  const remaining: RedemptionLot[] = [];

  for (const lot of sorted) {
    if (toSell <= 1e-9) {
      remaining.push(lot);
      continue;
    }
    const take = Math.min(lot.shares, toSell);
    const perUnitCost = lot.purchasePrice + (lot.brokerageFees || 0) / lot.shares;
    const costBasis = roundCurrency(take * perUnitCost);
    const proceeds = roundCurrency(take * redemptionPrice);
    const holdingDays = daysBetween(lot.date, redemptionDate);
    consumed.push({
      lotId: lot.id,
      date: lot.date,
      shares: roundCurrency(take),
      purchasePrice: lot.purchasePrice,
      costBasis,
      proceeds,
      gain: roundCurrency(proceeds - costBasis),
      holdingDays,
      isLongTerm: holdingDays >= longTermDays,
    });
    toSell -= take;
    const left = roundCurrency(lot.shares - take);
    if (left > 0) {
      const feeShare = lot.brokerageFees ? roundCurrency((lot.brokerageFees * left) / lot.shares) : undefined;
      remaining.push({ ...lot, shares: left, brokerageFees: feeShare });
    }
  }

  return {
    consumed,
    remaining,
    costBasis: roundCurrency(consumed.reduce((s, c) => s + c.costBasis, 0)),
  };
}

export function calculateRedemption(params: RedemptionCalculationParams): RedemptionCalculationResult {
  const {
    totalUnitsOrShares,
    totalCostBasis,
    unitsOrSharesToRedeem,
    redemptionPrice,
    chargesAmount = 0,
    taxRatePercent = 0,
    isFixedDeposit = false,
    lots,
    redemptionDate,
    longTermDays = 365,
  } = params;

  const validUnitsToRedeem = Math.max(0, Math.min(totalUnitsOrShares, unitsOrSharesToRedeem));
  const isFullRedemption = validUnitsToRedeem >= totalUnitsOrShares - 0.0001;

  let grossProceeds = 0;
  let allocatedCostBasis = 0;
  let remainingCostBasis = 0;
  let consumedLots: ConsumedLot[] | undefined;
  let remainingLots: RedemptionLot[] | undefined;
  let shortTermGain: number | undefined;
  let longTermGain: number | undefined;

  const usableLots = lots && lots.length > 0 && lots.reduce((s, l) => s + (l.shares || 0), 0) > 0 ? lots : undefined;

  if (isFixedDeposit) {
    // For Fixed Deposits, units is considered 1 (or principal proportion)
    grossProceeds = roundCurrency(redemptionPrice);
    allocatedCostBasis = roundCurrency(totalCostBasis);
    remainingCostBasis = 0;
  } else if (usableLots) {
    // FIFO lot accounting: oldest purchases are sold first.
    const fifo = consumeLotsFifo(usableLots, validUnitsToRedeem, redemptionPrice, redemptionDate, longTermDays);
    grossProceeds = roundCurrency(validUnitsToRedeem * redemptionPrice);
    allocatedCostBasis = fifo.costBasis;
    remainingCostBasis = roundCurrency(
      fifo.remaining.reduce((s, l) => s + l.shares * l.purchasePrice + (l.brokerageFees || 0), 0)
    );
    consumedLots = fifo.consumed;
    remainingLots = fifo.remaining;
    shortTermGain = roundCurrency(fifo.consumed.filter((c) => !c.isLongTerm).reduce((s, c) => s + c.gain, 0));
    longTermGain = roundCurrency(fifo.consumed.filter((c) => c.isLongTerm).reduce((s, c) => s + c.gain, 0));
  } else {
    // Proportional cost basis allocation:
    // Allocated Cost = Total Cost * (Units Redeemed / Total Units)
    const redemptionRatio = totalUnitsOrShares > 0 ? validUnitsToRedeem / totalUnitsOrShares : 1;
    grossProceeds = roundCurrency(validUnitsToRedeem * redemptionPrice);
    allocatedCostBasis = roundCurrency(totalCostBasis * redemptionRatio);
    remainingCostBasis = roundCurrency(Math.max(0, totalCostBasis - allocatedCostBasis));
  }

  const charges = roundCurrency(Math.max(0, chargesAmount));
  
  // Realized profit or loss: Gross Proceeds - Allocated Cost Basis - Charges
  // Note: Profit is strictly the excess gain, NOT returned principal
  const grossGain = grossProceeds - allocatedCostBasis - charges;
  
  // Taxes apply only if there is a positive capital gain
  let taxes = 0;
  if (taxRatePercent > 0 && grossGain > 0) {
    taxes = roundCurrency((grossGain * taxRatePercent) / 100);
  }

  // Net Credited = Gross Proceeds - Charges - Taxes
  const netCreditedAmount = roundCurrency(Math.max(0, grossProceeds - charges - taxes));
  
  // Net Realized P&L = Net Credited - Allocated Cost Basis
  const realizedProfitLoss = roundCurrency(netCreditedAmount - allocatedCostBasis);

  const remainingUnitsOrShares = roundCurrency(Math.max(0, totalUnitsOrShares - validUnitsToRedeem));

  return {
    unitsOrSharesRedeemed: validUnitsToRedeem,
    remainingUnitsOrShares,
    redemptionPrice,
    grossProceeds,
    charges,
    taxes,
    netCreditedAmount,
    allocatedCostBasis,
    remainingCostBasis,
    realizedProfitLoss,
    isFullRedemption,
    consumedLots,
    remainingLots,
    shortTermGain,
    longTermGain,
  };
}
