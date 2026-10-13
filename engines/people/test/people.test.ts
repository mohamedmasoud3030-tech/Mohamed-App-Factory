import { describe, expect, it } from 'vitest';
import { computeAttendanceWorkHours, computeLateMinutes, computeOvertimeMinutes } from '../src/attendance.js';
import { canTakeLeave, computePayslip, loanSchedule, remainingLeave } from '../src/payroll.js';

describe('attendance (extracted from larabeauty)', () => {
  it('computes work hours, lateness and overtime', () => {
    expect(computeAttendanceWorkHours('09:00', '17:30', 'PRESENT')).toBe(8.5);
    expect(computeAttendanceWorkHours('09:00', '17:30', 'ABSENT')).toBe(0);
    expect(computeLateMinutes('09:00', '09:20')).toBe(20);
    expect(computeLateMinutes('09:00', '08:55')).toBe(0);
    expect(computeOvertimeMinutes('09:00', '18:00')).toBe(60);
  });
});

describe('payroll & leave', () => {
  it('splits loans with the last installment absorbing rounding', () => {
    const s = loanSchedule(10000, 3);
    expect(s.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(s).toEqual([3333, 3333, 3334]);
  });
  it('tracks leave balance', () => {
    const b = { accruedDays: 21, takenDays: 5, carriedOverDays: 2 };
    expect(remainingLeave(b)).toBe(18);
    expect(canTakeLeave(b, 18)).toBe(true);
    expect(canTakeLeave(b, 19)).toBe(false);
  });
  it('computes a payslip in minor units', () => {
    const slip = computePayslip({
      baseSalaryMinor: 900000, workingDaysInMonth: 30, absentDays: 1,
      lateMinutes: 60, lateRatePerMinuteMinor: 100,
      overtimeMinutes: 120, overtimeRatePerMinuteMinor: 200,
      loanInstallmentMinor: 50000,
    });
    expect(slip.dailyRateMinor).toBe(30000);
    expect(slip.absenceDeductionMinor).toBe(30000);
    expect(slip.lateDeductionMinor).toBe(6000);
    expect(slip.overtimePayMinor).toBe(24000);
    expect(slip.netMinor).toBe(900000 + 24000 - 30000 - 6000 - 50000);
  });
});
