import { describe, expect, it } from 'vitest';
import { commandFailureState, commandIdempotencyKey, commandSuccessState } from '../src/idempotency.js';
import { assertOwnsTenant, resolveTenantContext, TenantContextError } from '../src/tenant.js';
import { brandingCssVariables, parseBrand } from '../src/branding.js';

describe('tenant context (ADR-0002/0005, fail-closed)', () => {
  const memberships = [{ tenantId: 'org-1', role: 'admin' }];
  it('resolves only from server-side membership', () => {
    const ctx = resolveTenantContext({ sessionUserId: 'u1', memberships, activeTenantId: 'org-1' });
    expect(ctx.tenantId).toBe('org-1');
    expect(() => resolveTenantContext({ sessionUserId: 'u1', memberships, activeTenantId: null, clientHint: 'org-2' })).toThrow(TenantContextError);
    expect(() => resolveTenantContext({ sessionUserId: null, memberships, activeTenantId: 'org-1' })).toThrow(TenantContextError);
  });
  it('blocks cross-tenant row access', () => {
    const ctx = resolveTenantContext({ sessionUserId: 'u1', memberships, activeTenantId: 'org-1' });
    expect(() => assertOwnsTenant(ctx, 'org-2')).toThrow(TenantContextError);
    expect(() => assertOwnsTenant(ctx, 'org-1')).not.toThrow();
  });
});

describe('idempotency lifecycle (Terranex contract)', () => {
  it('keeps the key on failure, rotates it after confirmed success', () => {
    const s0 = { successCount: 0 };
    const failed = commandFailureState(s0, 'network');
    expect(commandIdempotencyKey('sale', 'n1', failed.successCount ?? 0)).toBe(commandIdempotencyKey('sale', 'n1', 0));
    const ok = commandSuccessState(failed);
    expect(ok.successCount).toBe(1);
    expect(commandIdempotencyKey('sale', 'n1', ok.successCount ?? 0)).not.toBe(commandIdempotencyKey('sale', 'n1', 0));
  });
});

describe('branding (visitor-local)', () => {
  it('parses stored brand with safe fallbacks and emits CSS vars', () => {
    const b = parseBrand(JSON.stringify({ businessName: 'محلي', primaryColor: '#112233', accentColor: 'bad' }));
    expect(b.businessName).toBe('محلي');
    expect(b.primaryColor).toBe('#112233');
    expect(b.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(brandingCssVariables(b)['--brand-primary']).toBe('#112233');
    expect(parseBrand('not-json').businessName).toBe('Nile Systems');
  });
});
