/**
 * Nile Platform Engine — "try it with your name" branding.
 * Benchmark feature: the visitor types their business name/logo/colors and
 * every system + site instantly re-skins. Stored ONLY on the visitor's
 * device (localStorage) — never sent to the server (pure functions here;
 * the web app binds them to localStorage + CSS variables).
 */

export interface BrandIdentity {
  businessName: string;
  /** data-URI or object URL; visitor-local only */
  logoDataUri?: string;
  primaryColor: string;
  accentColor: string;
}

export const BRANDING_STORAGE_KEY = 'nile.branding.v1';

export const DEFAULT_BRAND: BrandIdentity = {
  businessName: 'Nile Systems',
  primaryColor: '#0f766e',
  accentColor: '#f59e0b',
};

export function brandingCssVariables(brand: BrandIdentity): Record<string, string> {
  return {
    '--brand-primary': brand.primaryColor,
    '--brand-accent': brand.accentColor,
    '--brand-name': `"${brand.businessName.replace(/"/g, '')}"`,
  };
}

export function parseBrand(raw: string | null): BrandIdentity {
  if (!raw) return DEFAULT_BRAND;
  try {
    const parsed = JSON.parse(raw) as Partial<BrandIdentity>;
    return {
      businessName: typeof parsed.businessName === 'string' && parsed.businessName.trim() ? parsed.businessName : DEFAULT_BRAND.businessName,
      logoDataUri: typeof parsed.logoDataUri === 'string' ? parsed.logoDataUri : undefined,
      primaryColor: isHexColor(parsed.primaryColor) ? parsed.primaryColor : DEFAULT_BRAND.primaryColor,
      accentColor: isHexColor(parsed.accentColor) ? parsed.accentColor : DEFAULT_BRAND.accentColor,
    };
  } catch {
    return DEFAULT_BRAND;
  }
}

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}
