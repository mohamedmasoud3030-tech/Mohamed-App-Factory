/**
 * Catalog persistence services (tenant-scoped via withTenant ⇒ RLS).
 */
import { and, asc, eq } from 'drizzle-orm';
import { withTenant, type AnyPgDatabase } from '../../platform/src/db/with-tenant.js';
import { catalogItems, catalogVariants } from './db/schema.js';
import { variantStockState, type VariantStockState } from './catalog.js';

export interface CatalogListItem {
  id: string;
  nameAr: string;
  nameEn: string;
  category: string;
  priceMinor: number;
  compareAtMinor: number | null;
  variants: Array<{ id: string; sku: string; labelAr: string; labelEn: string; stock: string; stockState: VariantStockState }>;
}

export async function listCatalog(db: AnyPgDatabase, tenantId: string, opts: { lowThreshold?: number } = {}): Promise<CatalogListItem[]> {
  return withTenant(db, tenantId, async (tx: any) => {
    const rows = await tx
      .select({ item: catalogItems, variant: catalogVariants })
      .from(catalogItems)
      .innerJoin(catalogVariants, and(eq(catalogVariants.tenantId, catalogItems.tenantId), eq(catalogVariants.itemId, catalogItems.id)))
      .where(eq(catalogItems.isActive, true))
      .orderBy(asc(catalogItems.category), asc(catalogItems.nameEn), asc(catalogVariants.sku));
    const out = new Map<string, CatalogListItem>();
    for (const { item, variant } of rows) {
      let entry = out.get(item.id);
      if (!entry) {
        entry = {
          id: item.id,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          category: item.category,
          priceMinor: item.priceMinor,
          compareAtMinor: item.compareAtMinor,
          variants: [],
        };
        out.set(item.id, entry);
      }
      entry.variants.push({
        id: variant.id,
        sku: variant.sku,
        labelAr: variant.labelAr,
        labelEn: variant.labelEn,
        stock: variant.stock,
        stockState: variantStockState({ ...variant, stock: Number(variant.stock) }, opts.lowThreshold ?? 3),
      });
    }
    return [...out.values()];
  });
}

export interface NewCatalogItem {
  nameAr: string;
  nameEn: string;
  category: string;
  priceMinor: number;
  compareAtMinor?: number;
  variants: Array<{ sku: string; labelAr: string; labelEn: string; stock: string }>;
}

export async function createCatalogItems(db: AnyPgDatabase, tenantId: string, items: NewCatalogItem[]): Promise<void> {
  await withTenant(db, tenantId, async (tx: any) => {
    for (const it of items) {
      const [row] = await tx
        .insert(catalogItems)
        .values({ tenantId, nameAr: it.nameAr, nameEn: it.nameEn, category: it.category, priceMinor: it.priceMinor, compareAtMinor: it.compareAtMinor ?? null })
        .returning({ id: catalogItems.id });
      await tx.insert(catalogVariants).values(it.variants.map((v) => ({ tenantId, itemId: row.id, ...v })));
    }
  });
}
