import { describe, expect, it } from 'vitest';
import { can, permissionsOf, roles } from '../src/auth/permissions.js';
import { DEMO_ACCOUNTS } from '../src/demo-seed.js';

describe('roles & permissions (Better Auth access control)', () => {
  it('every demo account role is a declared role', () => {
    for (const a of DEMO_ACCOUNTS) expect(Object.keys(roles)).toContain(a.role);
  });

  it('cashier can sell and read, but cannot void or manage catalog', () => {
    expect(can('cashier', { sale: ['create'] })).toBe(true);
    expect(can('cashier', { sale: ['read'], catalog: ['read'] })).toBe(true);
    expect(can('cashier', { sale: ['void'] })).toBe(false);
    expect(can('cashier', { catalog: ['manage'] })).toBe(false);
  });

  it('storekeeper manages stock but cannot sell', () => {
    expect(can('storekeeper', { stock: ['adjust'] })).toBe(true);
    expect(can('storekeeper', { sale: ['create'] })).toBe(false);
  });

  it('unknown or empty roles grant nothing (fail closed)', () => {
    expect(can('', { sale: ['read'] })).toBe(false);
    expect(can('superuser', { sale: ['read'] })).toBe(false);
    expect(permissionsOf('nobody')).toEqual([]);
  });

  it('multi-role field grants the union', () => {
    expect(can('storekeeper, cashier', { sale: ['create'] })).toBe(true);
  });
});
