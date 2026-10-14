/**
 * Demo-mode seed specification (benchmark model): one demo tenant, ready-made
 * role accounts, unified password `demo1234`. Passwords are hashed by the
 * auth layer (Better Auth, ADR-0005) at seed time — never stored here.
 * A nightly job re-seeds this tenant so demo data resets daily.
 */
export const DEMO_TENANT = { slug: 'nile-demo', nameAr: 'نيل — حساب تجريبي', nameEn: 'Nile Demo' } as const;

export const DEMO_PASSWORD = 'demo1234';

export interface DemoAccount {
  system: 'pos' | 'inventory' | 'restaurant' | 'clinic' | 'hr' | 'courts' | 'admin';
  role: string;
  email: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { system: 'pos', role: 'branch-manager', email: 'pos-manager@nile.demo' },
  { system: 'pos', role: 'cashier', email: 'cashier@nile.demo' },
  { system: 'inventory', role: 'inventory-manager', email: 'inventory-manager@nile.demo' },
  { system: 'inventory', role: 'storekeeper', email: 'storekeeper@nile.demo' },
  { system: 'restaurant', role: 'restaurant-manager', email: 'restaurant-manager@nile.demo' },
  { system: 'restaurant', role: 'waiter', email: 'waiter@nile.demo' },
  { system: 'restaurant', role: 'kitchen', email: 'kitchen@nile.demo' },
  { system: 'clinic', role: 'clinic-manager', email: 'clinic-manager@nile.demo' },
  { system: 'clinic', role: 'reception', email: 'reception@nile.demo' },
  { system: 'clinic', role: 'doctor', email: 'doctor@nile.demo' },
  { system: 'hr', role: 'hr-manager', email: 'hr-manager@nile.demo' },
  { system: 'hr', role: 'employee', email: 'employee@nile.demo' },
  { system: 'courts', role: 'courts-manager', email: 'courts-manager@nile.demo' },
  { system: 'admin', role: 'site-admin', email: 'admin@nile.demo' },
];
