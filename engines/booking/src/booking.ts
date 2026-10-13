/**
 * Nile Booking Engine — generic scheduling core.
 *
 * Generalized from:
 *  - larabeauty- `src/domain/entities` (AppointmentStatus + server-enforced
 *    VisitStage lifecycle: a client can never skip a stage) — the status
 *    machine below mirrors that contract.
 *  - starting `src/features/calendar/calendarModel.ts` (pure day-grouping /
 *    month-grid helpers) — re-implemented generically + timezone-parameterized
 *    (default Africa/Cairo instead of the source's Asia/Muscat).
 *
 * Pure TypeScript: no DB, no framework. Persistence (Drizzle/RLS per
 * ADR-0004/0005) plugs in behind these types.
 */

export type BookingStatus =
  | 'PENDING' // requested by customer, awaiting confirmation (e.g. deposit)
  | 'CONFIRMED'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface BookableResource {
  id: string;
  tenantId: string;
  /** court | doctor | table | room | trainer ... */
  kind: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
}

export interface Booking {
  id: string;
  tenantId: string;
  resourceId: string;
  customerName: string;
  customerPhone: string;
  /** ISO timestamps */
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  /** integer minor units (see transactions/money-minor) */
  depositMinor: number;
  code: string;
}

/** Statuses that keep the slot occupied. CANCELLED / NO_SHOW free the slot. */
const BLOCKING: ReadonlySet<BookingStatus> = new Set(['PENDING', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED']);

export function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(bStart).getTime() < new Date(aEnd).getTime();
}

/** True if `candidate` collides with any blocking booking of the same resource. */
export function hasConflict(existing: readonly Booking[], candidate: Pick<Booking, 'resourceId' | 'startsAt' | 'endsAt'>): boolean {
  return existing.some(
    (b) =>
      b.resourceId === candidate.resourceId &&
      BLOCKING.has(b.status) &&
      intervalsOverlap(b.startsAt, b.endsAt, candidate.startsAt, candidate.endsAt),
  );
}

export interface Slot {
  startsAt: string;
  endsAt: string;
}

/**
 * Generate bookable slots for one local day.
 * `dateISO` = 'YYYY-MM-DD' (local), open/close = 'HH:MM'.
 */
export function generateSlots(opts: {
  dateISO: string;
  openTime: string;
  closeTime: string;
  durationMinutes: number;
  stepMinutes?: number;
  existing: readonly Booking[];
  resourceId: string;
}): Slot[] {
  const step = opts.stepMinutes ?? opts.durationMinutes;
  const [oh = 0, om = 0] = opts.openTime.split(':').map(Number);
  const [ch = 0, cm = 0] = opts.closeTime.split(':').map(Number);
  const dayStart = new Date(`${opts.dateISO}T00:00:00`);
  const cursor = new Date(dayStart);
  cursor.setHours(oh, om, 0, 0);
  const close = new Date(dayStart);
  close.setHours(ch, cm, 0, 0);

  const slots: Slot[] = [];
  while (true) {
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + opts.durationMinutes * 60_000);
    if (end > close) break;
    const candidate = { resourceId: opts.resourceId, startsAt: start.toISOString(), endsAt: end.toISOString() };
    if (!hasConflict(opts.existing, candidate)) slots.push(candidate);
    cursor.setTime(cursor.getTime() + step * 60_000);
  }
  return slots;
}

/**
 * Lifecycle state machine (mirrors larabeauty's server-enforced visit stages).
 * Returns the next status, or null when the transition is illegal.
 */
export type BookingAction = 'confirm' | 'arrive' | 'start' | 'complete' | 'cancel' | 'noShow';

const TRANSITIONS: Record<BookingStatus, Partial<Record<BookingAction, BookingStatus>>> = {
  PENDING: { confirm: 'CONFIRMED', cancel: 'CANCELLED', noShow: 'NO_SHOW' },
  CONFIRMED: { arrive: 'ARRIVED', cancel: 'CANCELLED', noShow: 'NO_SHOW' },
  ARRIVED: { start: 'IN_PROGRESS', cancel: 'CANCELLED' },
  IN_PROGRESS: { complete: 'COMPLETED' },
  COMPLETED: {},
  CANCELLED: {},
  NO_SHOW: {},
};

export function transitionBooking(status: BookingStatus, action: BookingAction): BookingStatus | null {
  return TRANSITIONS[status][action] ?? null;
}

/** Human-facing booking code, e.g. BK-7F3K2 (no ambiguous chars). */
export function bookingCode(seed: string): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let out = '';
  for (let i = 0; i < 5; i++) {
    hash = Math.imul(hash ^ (hash >>> 13), 16777619);
    out += alphabet.charAt(Math.abs(hash) % alphabet.length);
  }
  return `BK-${out}`;
}

/** Group items by local calendar day in a timezone (default Africa/Cairo). */
export function groupByLocalDay<T>(items: readonly T[], at: (item: T) => string, timeZone = 'Africa/Cairo'): Map<string, T[]> {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = fmt.format(new Date(at(item)));
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }
  return map;
}
