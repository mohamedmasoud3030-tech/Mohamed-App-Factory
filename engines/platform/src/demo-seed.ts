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
  { system: 'pos', role: 'branch-manager', email: 'pos-manager@example.invalid' },
  { system: 'pos', role: 'cashier', email: 'cashier@example.invalid' },
  { system: 'inventory', role: 'inventory-manager', email: 'inventory-manager@example.invalid' },
  { system: 'inventory', role: 'storekeeper', email: 'storekeeper@example.invalid' },
  { system: 'restaurant', role: 'restaurant-manager', email: 'restaurant-manager@example.invalid' },
  { system: 'restaurant', role: 'waiter', email: 'waiter@example.invalid' },
  { system: 'restaurant', role: 'kitchen', email: 'kitchen@example.invalid' },
  { system: 'clinic', role: 'clinic-manager', email: 'clinic-manager@example.invalid' },
  { system: 'clinic', role: 'reception', email: 'reception@example.invalid' },
  { system: 'clinic', role: 'doctor', email: 'doctor@example.invalid' },
  { system: 'hr', role: 'hr-manager', email: 'hr-manager@example.invalid' },
  { system: 'hr', role: 'employee', email: 'employee@example.invalid' },
  { system: 'courts', role: 'courts-manager', email: 'courts-manager@example.invalid' },
  { system: 'admin', role: 'site-admin', email: 'admin@example.invalid' },
];
