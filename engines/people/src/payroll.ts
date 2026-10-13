/**
 * Nile People Engine — payroll & leave math (pure).
 * All money is integer minor units (see transactions/money-minor).
 * Rules are parameterized; Egyptian labour-law defaults are NOT hardcoded —
 * the tenant's policy supplies rates.
 */

export interface LeaveBalance {
  accruedDays: number;
  takenDays: number;
  carriedOverDays: number;
}

export function remainingLeave(b: LeaveBalance): number {
  return b.accruedDays + b.carriedOverDays - b.takenDays;
}

export function canTakeLeave(b: LeaveBalance, days: number): boolean {
  return days > 0 && remainingLeave(b) >= days;
}

/** Split a loan/advance total into `months` installments; last one absorbs rounding. */
export function loanSchedule(totalMinor: number, months: number): number[] {
  if (months <= 0 || totalMinor < 0) return [];
  const base = Math.floor(totalMinor / months);
  const out = Array.from({ length: months }, () => base);
  out[months - 1] = totalMinor - base * (months - 1);
  return out;
}

export interface PayslipInput {
  baseSalaryMinor: number;
  workingDaysInMonth: number;
  absentDays: number;
  lateMinutes: number;
  /** deduction per late minute, minor units — tenant policy */
  lateRatePerMinuteMinor: number;
  overtimeMinutes: number;
  /** pay per overtime minute, minor units — tenant policy */
  overtimeRatePerMinuteMinor: number;
  loanInstallmentMinor: number;
  otherDeductionsMinor?: number;
  allowancesMinor?: number;
}

export interface Payslip {
  dailyRateMinor: number;
  absenceDeductionMinor: number;
  lateDeductionMinor: number;
  overtimePayMinor: number;
  grossMinor: number;
  totalDeductionsMinor: number;
  netMinor: number;
}

export function computePayslip(i: PayslipInput): Payslip {
  const dailyRateMinor = i.workingDaysInMonth > 0 ? Math.floor(i.baseSalaryMinor / i.workingDaysInMonth) : 0;
  const absenceDeductionMinor = dailyRateMinor * Math.max(0, i.absentDays);
  const lateDeductionMinor = Math.max(0, i.lateMinutes) * i.lateRatePerMinuteMinor;
  const overtimePayMinor = Math.max(0, i.overtimeMinutes) * i.overtimeRatePerMinuteMinor;
  const grossMinor = i.baseSalaryMinor + overtimePayMinor + (i.allowancesMinor ?? 0);
  const totalDeductionsMinor = absenceDeductionMinor + lateDeductionMinor + i.loanInstallmentMinor + (i.otherDeductionsMinor ?? 0);
  return {
    dailyRateMinor,
    absenceDeductionMinor,
    lateDeductionMinor,
    overtimePayMinor,
    grossMinor,
    totalDeductionsMinor,
    netMinor: grossMinor - totalDeductionsMinor,
  };
}
