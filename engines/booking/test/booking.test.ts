import { describe, expect, it } from 'vitest';
import { bookingCode, generateSlots, hasConflict, transitionBooking, type Booking } from '../src/booking.js';

const base: Booking = {
  id: '1', tenantId: 't1', resourceId: 'court-1', customerName: 'Ahmed', customerPhone: '01000000000',
  startsAt: '2026-10-20T10:00:00.000Z', endsAt: '2026-10-20T11:00:00.000Z',
  status: 'CONFIRMED', depositMinor: 5000, code: 'BK-XXXXX',
};

describe('booking conflict (double-booking prevention)', () => {
  it('detects overlap on same resource', () => {
    expect(hasConflict([base], { resourceId: 'court-1', startsAt: '2026-10-20T10:30:00.000Z', endsAt: '2026-10-20T11:30:00.000Z' })).toBe(true);
  });
  it('allows other resource and free slots', () => {
    expect(hasConflict([base], { resourceId: 'court-2', startsAt: base.startsAt, endsAt: base.endsAt })).toBe(false);
    expect(hasConflict([base], { resourceId: 'court-1', startsAt: '2026-10-20T11:00:00.000Z', endsAt: '2026-10-20T12:00:00.000Z' })).toBe(false);
  });
  it('cancelled bookings free the slot', () => {
    expect(hasConflict([{ ...base, status: 'CANCELLED' }], { resourceId: 'court-1', startsAt: base.startsAt, endsAt: base.endsAt })).toBe(false);
  });
});

describe('slot generation', () => {
  it('generates hourly slots and skips occupied ones', () => {
    const slots = generateSlots({
      dateISO: '2026-10-20', openTime: '09:00', closeTime: '13:00',
      durationMinutes: 60, existing: [{ ...base, startsAt: new Date('2026-10-20T10:00:00').toISOString(), endsAt: new Date('2026-10-20T11:00:00').toISOString() }],
      resourceId: 'court-1',
    });
    expect(slots.length).toBe(3); // 09, 11, 12 — 10 occupied
  });
});

describe('lifecycle state machine', () => {
  it('follows the happy path and rejects skipping stages', () => {
    expect(transitionBooking('PENDING', 'confirm')).toBe('CONFIRMED');
    expect(transitionBooking('CONFIRMED', 'arrive')).toBe('ARRIVED');
    expect(transitionBooking('ARRIVED', 'start')).toBe('IN_PROGRESS');
    expect(transitionBooking('IN_PROGRESS', 'complete')).toBe('COMPLETED');
    expect(transitionBooking('PENDING', 'complete')).toBeNull();
    expect(transitionBooking('COMPLETED', 'cancel')).toBeNull();
  });
  it('generates stable human codes', () => {
    expect(bookingCode('booking-1')).toBe(bookingCode('booking-1'));
    expect(bookingCode('booking-1')).toMatch(/^BK-[A-Z2-9]{5}$/);
  });
});
