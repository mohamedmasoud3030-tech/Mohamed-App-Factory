/**
 * Tenant provisioning + demo seed. Users are created through Better Auth's
 * internal adapter so password hashing stays inside Better Auth (ADR-0005).
 * Idempotent: re-running for an existing slug is a no-op.
 */
import { eq } from 'drizzle-orm';
import { member, organization } from '../../../engines/platform/src/auth/schema.js';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_TENANT, type DemoAccount } from '../../../engines/platform/src/demo-seed.js';
import { createCatalogItems, type NewCatalogItem } from '../../../engines/catalog/src/catalog-service.js';
import type { NileAuth } from '../../../engines/platform/src/auth/auth.js';
import type { NileDb } from '../../../engines/db/open.js';

export interface TenantSpec {
  slug: string;
  name: string;
  accounts: Array<Pick<DemoAccount, 'role' | 'email'> & { name?: string }>;
  password: string;
  catalog: NewCatalogItem[];
}

export async function provisionTenant(auth: NileAuth, db: NileDb, spec: TenantSpec): Promise<{ tenantId: string; created: boolean }> {
  const existing = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, spec.slug)).limit(1);
  if (existing[0]) return { tenantId: existing[0].id, created: false };

  const [org] = await db.insert(organization).values({ name: spec.name, slug: spec.slug }).returning({ id: organization.id });
  const tenantId = org!.id;
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(spec.password);

  for (const a of spec.accounts) {
    let user = await ctx.internalAdapter.findUserByEmail(a.email).then((r) => r?.user ?? null);
    if (!user) {
      user = await ctx.internalAdapter.createUser({ email: a.email, name: a.name ?? a.role, emailVerified: true }, { method: 'admin' });
      await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: hash });
    }
    await db.insert(member).values({ organizationId: tenantId, userId: user.id, role: a.role });
  }
  await createCatalogItems(db, tenantId, spec.catalog);
  return { tenantId, created: true };
}

const egp = (pounds: number) => Math.round(pounds * 100);

/** POS demo catalog — same data in Arabic and English. */
export const DEMO_CATALOG: NewCatalogItem[] = [
  { nameAr: 'مياه معدنية 600 مل', nameEn: 'Mineral water 600ml', category: 'drinks', priceMinor: egp(7.5), variants: [{ sku: 'WTR-600', labelAr: 'افتراضي', labelEn: 'Default', stock: '120' }] },
  { nameAr: 'مشروب غازي كانز', nameEn: 'Soft drink can', category: 'drinks', priceMinor: egp(15), variants: [{ sku: 'SODA-CAN', labelAr: 'افتراضي', labelEn: 'Default', stock: '80' }] },
  { nameAr: 'شيبسي', nameEn: 'Potato chips', category: 'snacks', priceMinor: egp(10), variants: [{ sku: 'CHIPS-S', labelAr: 'صغير', labelEn: 'Small', stock: '60' }, { sku: 'CHIPS-L', labelAr: 'كبير', labelEn: 'Large', stock: '2' }] },
  { nameAr: 'قهوة تركي 250 جم', nameEn: 'Turkish coffee 250g', category: 'grocery', priceMinor: egp(95), compareAtMinor: egp(110), variants: [{ sku: 'COF-250', labelAr: 'افتراضي', labelEn: 'Default', stock: '25' }] },
  { nameAr: 'زيت عباد الشمس 1 لتر', nameEn: 'Sunflower oil 1L', category: 'grocery', priceMinor: egp(89.95), variants: [{ sku: 'OIL-1L', labelAr: 'افتراضي', labelEn: 'Default', stock: '3' }] },
  { nameAr: 'جبنة رومي (بالكيلو)', nameEn: 'Roumy cheese (per kg)', category: 'deli', priceMinor: egp(320), variants: [{ sku: 'CHS-ROUMY', labelAr: 'افتراضي', labelEn: 'Default', stock: '12.500' }] },
];

export function demoTenantSpec(): TenantSpec {
  return {
    slug: DEMO_TENANT.slug,
    name: DEMO_TENANT.nameAr,
    accounts: DEMO_ACCOUNTS,
    password: DEMO_PASSWORD,
    catalog: DEMO_CATALOG,
  };
}
