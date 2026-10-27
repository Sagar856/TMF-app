import { LoanRecord } from '../types/finance';
import { todayLocalISO } from './dates';

/**
 * Computes the real-time effective status for a loan or lend:
 * - 'repaid': if remainingAmount <= 0 or status is 'repaid'.
 * - 'overdue': if any scheduled installment has dueDate < today,
 *              or for peer loans dueDate < today with remaining > 0.
 * - 'active': otherwise.
 */
export function getEffectiveLoanStatus(
  loan: LoanRecord,
  today: string = todayLocalISO()
): 'active' | 'repaid' | 'overdue' {
  if (loan.status === 'repaid' || loan.remainingAmount <= 0) {
    return 'repaid';
  }

  if (loan.schedule && loan.schedule.length > 0) {
    const hasOverdueInstallment = loan.schedule.some(
      (inst) =>
        (inst.status === 'scheduled' || inst.status === 'pending_confirmation' || inst.status === 'overdue') &&
        inst.dueDate < today
    );
    if (hasOverdueInstallment) {
      return 'overdue';
    }
  } else if (loan.dueDate && loan.dueDate < today && loan.remainingAmount > 0) {
    return 'overdue';
  }

  return 'active';
}
