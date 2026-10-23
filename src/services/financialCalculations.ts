/**
 * Precision Financial Calculation Engine for Personal Finance
 * Handles EMI calculations, amortization schedules, investment valuations,
 * fixed deposit compounding, and partial/full redemption cost-basis allocation.
 */

import { todayLocalISO, addMonthsClamped } from '../utils/dates';

export interface EmiCalculationParams {
  principal: number; // Financed amount
  annualInterestRate: number; // in percentage, e.g., 10.5 for 10.5%
  tenureMonths: number;
  loanStructure?: 'standard_emi' | 'no_cost_emi' | 'down_payment_emi' | 'interest_only' | 'peer_loan' | 'peer_lend';
  emiOverride?: number;
  startDate?: string;
  firstInstallmentDate?: string;
  processingFees?: number;
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
  monthlyEmi: number;
  calculatedEmi: number;
  isOverridden: boolean;
  emiDifference: number;
  financedPrincipal: number;
  totalInterestPayable: number;
  totalRepaymentAmount: number;
  schedule: AmortizationInstallment[];
}

/**
 * Rounds a number to exactly two decimal places using financial round-half-up
 */
export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Standard reducing-balance EMI formula:
 * EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 * where r = annualRate / (12 * 100)
 */
export function calculateStandardEMI(principal: number, annualRate: number, tenureMonths: number): number {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  if (annualRate <= 0) {
    return roundCurrency(principal / tenureMonths);
  }

  const r = annualRate / (12 * 100);
  const factor = Math.pow(1 + r, tenureMonths);
  const emi = (principal * r * factor) / (factor - 1);
  return roundCurrency(emi);
}

/**
 * Generates an accurate, month-by-month amortization schedule with exact rounding
 * and final installment reconciliation.
 */
export function generateAmortizationSchedule(params: EmiCalculationParams): AmortizationScheduleResult {
  const {
    principal,
    annualInterestRate,
    tenureMonths,
    loanStructure = 'standard_emi',
    emiOverride,
    firstInstallmentDate = todayLocalISO(),
  } = params;

  if (principal <= 0 || tenureMonths <= 0) {
    return {
      monthlyEmi: 0,
      calculatedEmi: 0,
      isOverridden: false,
      emiDifference: 0,
      financedPrincipal: principal,
      totalInterestPayable: 0,
      totalRepaymentAmount: 0,
      schedule: [],
    };
  }

  // Calculate theoretical EMI
  let theoreticalEmi = 0;
  if (loanStructure === 'no_cost_emi' || annualInterestRate <= 0) {
    // In No-cost EMI, customer pays zero interest
    theoreticalEmi = roundCurrency(principal / tenureMonths);
  } else if (loanStructure === 'interest_only') {
    // Interest only payment monthly, principal lump sum at the end
    const monthlyRate = annualInterestRate / (12 * 100);
    theoreticalEmi = roundCurrency(principal * monthlyRate);
  } else {
    theoreticalEmi = calculateStandardEMI(principal, annualInterestRate, tenureMonths);
  }

  const effectiveEmi = emiOverride && emiOverride > 0 ? roundCurrency(emiOverride) : theoreticalEmi;
  const isOverridden = Boolean(emiOverride && Math.abs(emiOverride - theoreticalEmi) > 0.01);
  const emiDifference = isOverridden ? roundCurrency(effectiveEmi - theoreticalEmi) : 0;

  const schedule: AmortizationInstallment[] = [];
  let remainingPrincipal = principal;
  let totalInterest = 0;
  const monthlyRate = annualInterestRate / (12 * 100);

  for (let i = 1; i <= tenureMonths; i++) {
    // Advance month safely with day clamping (e.g. Jan 31 -> Feb 28 -> Mar 31)
    const dueDateStr = addMonthsClamped(firstInstallmentDate, i - 1);

    let interestComponent = 0;
    let principalComponent = 0;
    let currentEmi = effectiveEmi;

    if (loanStructure === 'no_cost_emi' || annualInterestRate <= 0) {
      interestComponent = 0;
      if (i === tenureMonths) {
        principalComponent = remainingPrincipal;
        currentEmi = principalComponent;
      } else {
        principalComponent = roundCurrency(principal / tenureMonths);
      }
    } else if (loanStructure === 'interest_only') {
      interestComponent = roundCurrency(remainingPrincipal * monthlyRate);
      if (i === tenureMonths) {
        principalComponent = remainingPrincipal;
        currentEmi = roundCurrency(interestComponent + principalComponent);
      } else {
        principalComponent = 0;
        currentEmi = interestComponent;
      }
    } else {
      // Standard reducing balance
      interestComponent = roundCurrency(remainingPrincipal * monthlyRate);

      if (i === tenureMonths) {
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
  }

  const totalRepayment = roundCurrency(principal + totalInterest);

  return {
    monthlyEmi: effectiveEmi,
    calculatedEmi: theoreticalEmi,
    isOverridden,
    emiDifference,
    financedPrincipal: principal,
    totalInterestPayable: totalInterest,
    totalRepaymentAmount: totalRepayment,
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
}

export function calculateFixedDeposit(params: FdCalculationParams): FdCalculationResult {
  const {
    principal,
    annualInterestRate,
    depositDate,
    maturityDate,
    tenureMonths = 12,
    compoundingFrequency = 'quarterly',
    prematurePenaltyPercent = 1.0,
    currentDate = todayLocalISO(),
  } = params;

  if (principal <= 0) {
    return {
      principal: 0,
      totalMaturityAmount: 0,
      totalInterestAtMaturity: 0,
      accruedInterestToDate: 0,
      currentRealizableValue: 0,
      prematurePenaltyAmount: 0,
      tenureDays: 0,
      daysElapsed: 0,
      effectiveAnnualYield: 0,
    };
  }

  const [dy, dm, dd] = depositDate.split('-').map(Number);
  const depDate = new Date(dy, dm - 1, dd || 1);
  let matDate: Date;
  if (maturityDate) {
    const [my, mm, md] = maturityDate.split('-').map(Number);
    matDate = new Date(my, mm - 1, md || 1);
  } else {
    const matDateStr = addMonthsClamped(depositDate, tenureMonths);
    const [my, mm, md] = matDateStr.split('-').map(Number);
    matDate = new Date(my, mm - 1, md || 1);
  }

  const [cy, cm, cd] = currentDate.split('-').map(Number);
  const now = new Date(cy, cm - 1, cd || 1);

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

  let totalMaturityAmount = 0;
  let totalInterestAtMaturity = 0;

  const r = annualInterestRate / 100;

  if (compoundingFrequency === 'simple') {
    totalInterestAtMaturity = roundCurrency(principal * r * yearsTotal);
    totalMaturityAmount = roundCurrency(principal + totalInterestAtMaturity);
  } else {
    // Compound interest: A = P * (1 + r/n)^(n * t)
    totalMaturityAmount = roundCurrency(principal * Math.pow(1 + r / compN, compN * yearsTotal));
    totalInterestAtMaturity = roundCurrency(totalMaturityAmount - principal);
  }

  // Accrued interest to current date
  let accruedInterestToDate = 0;
  if (compoundingFrequency === 'simple') {
    accruedInterestToDate = roundCurrency(principal * r * yearsElapsed);
  } else {
    const valueNow = principal * Math.pow(1 + r / compN, compN * yearsElapsed);
    accruedInterestToDate = roundCurrency(Math.max(0, valueNow - principal));
  }

  // Premature withdrawal calculation (applies penalty on interest rate)
  const penaltyRate = Math.max(0, r - (prematurePenaltyPercent / 100));
  let prematureValueNow = principal;
  if (compoundingFrequency === 'simple') {
    prematureValueNow = roundCurrency(principal + principal * penaltyRate * yearsElapsed);
  } else {
    prematureValueNow = roundCurrency(principal * Math.pow(1 + penaltyRate / compN, compN * yearsElapsed));
  }

  const prematurePenaltyAmount = roundCurrency(Math.max(0, (principal + accruedInterestToDate) - prematureValueNow));
  const currentRealizableValue = roundCurrency(principal + accruedInterestToDate - prematurePenaltyAmount);

  const effectiveYield = yearsTotal > 0 ? roundCurrency(((totalMaturityAmount - principal) / (principal * yearsTotal)) * 100) : annualInterestRate;

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
  };
}

/* =========================================================================
   Redemption Engine (Full & Partial)
   ========================================================================= */

export interface RedemptionCalculationParams {
  totalUnitsOrShares: number;
  totalCostBasis: number;
  unitsOrSharesToRedeem: number;
  redemptionPrice: number; // NAV or price per share or FD maturity value
  chargesAmount?: number; // Exit load / Brokerage / Penalty
  taxRatePercent?: number; // STCG / LTCG / TDS %
  isFixedDeposit?: boolean;
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
  } = params;

  const validUnitsToRedeem = Math.max(0, Math.min(totalUnitsOrShares, unitsOrSharesToRedeem));
  const isFullRedemption = validUnitsToRedeem >= totalUnitsOrShares - 0.0001;

  let grossProceeds = 0;
  let allocatedCostBasis = 0;
  let remainingCostBasis = 0;

  if (isFixedDeposit) {
    // For Fixed Deposits, units is considered 1 (or principal proportion)
    grossProceeds = roundCurrency(redemptionPrice);
    allocatedCostBasis = roundCurrency(totalCostBasis);
    remainingCostBasis = 0;
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
  };
}
