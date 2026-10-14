/**
 * Phase 2 / Gate B on REAL PostgreSQL 18 via openPostgres (runtime login nile_login),
 * full HTTP stack (NestJS + Fastify + Better Auth). Scratch — never committed.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPostgres, type OpenedDatabase } from '../engines/db/open.ts';
import { createAuth } from '../engines/platform/src/auth/auth.ts';
import { member, organization, user, session } from '../engines/platform/src/auth/schema.ts';
import { DEMO_ACCOUNTS } from '../engines/platform/src/demo-seed.ts';
import { can } from '../engines/platform/src/auth/permissions.ts';
import { createApp, type CreatedApp } from '../apps/api/src/app.ts';
import { demoTenantSpec, provisionTenant } from '../apps/api/src/provision.ts';

const BASE = 'http://localhost:3000';
let opened: OpenedDatabase;
let created: CreatedApp;
let demoId: string;
let otherId: string;
const log = (...a: unknown[]) => console.log('OBSERVED:', ...a);

async function http(method: string, url: string, o: { cookie?: string; body?: unknown; origin?: string } = {}) {
  const res = await created.app.getHttpAdapter().getInstance().inject({
    method: method as 'GET', url,
    headers: { origin: o.origin ?? BASE, ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}) },
    payload: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  let body: any = res.body; try { body = JSON.parse(res.body); } catch { /* */ }
  return { status: res.statusCode, body, headers: res.headers };
}
async function login(email: string, password = 'demo1234') {
  const r = await http('POST', '/api/auth/sign-in/email', { body: { email, password } });
  const raw = r.headers['set-cookie']; const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return { status: r.status, cookie: list.map((c) => String(c).split(';')[0]).join('; '), setCookie: list };
}

beforeAll(async () => {
  opened = await openPostgres({ url: 'postgres://nile_login@127.0.0.1:5433/nile' });
  const auth = createAuth(opened.db, { baseURL: BASE, secret: 'x'.repeat(48), trustedOrigins: [BASE] });
  demoId = (await provisionTenant(auth, opened.db, demoTenantSpec())).tenantId;
  otherId = (await provisionTenant(auth, opened.db, {
    slug: 'other-co', name: 'Other Co', password: 'other-pass-123',
    accounts: [{ role: 'cashier', email: 'cashier@other.test' }],
    catalog: [{ nameAr: 'آخر', nameEn: 'Other', category: 'x', priceMinor: 500, variants: [{ sku: 'OTH-1', labelAr: 'افتراضي', labelEn: 'Default', stock: '10' }] }],
  })).tenantId;
  created = await createApp({ db: opened.db, auth }, { logger: false });
});
afterAll(async () => { await created.app.close(); await opened.close(); });

describe('B1 authentication basics on real PG', () => {
  it('sign-up disabled, wrong password, anonymous, cookie flags', async () => {
    const before = Number((await opened.db.select({ n: sql<number>`count(*)` }).from(user))[0]!.n);
    const su = await http('POST', '/api/auth/sign-up/email', { body: { email: 'new@x.test', password: 'whatever123', name: 'x' } });
    const after = Number((await opened.db.select({ n: sql<number>`count(*)` }).from(user))[0]!.n);
    const wrong = await login('cashier@nile.demo', 'wrong-pass');
    const ok = await login('cashier@nile.demo');
    log('B1 sign-up →', su.status, su.body?.code ?? '', '; users before/after =', before, after, '; wrong pw →', wrong.status, '; good →', ok.status);
    log('B1 Set-Cookie flags =', ok.setCookie.map((c) => c.split(';').slice(1).map((s) => s.trim()).join('; ')).join(' | '));
    const anon = await Promise.all([http('GET', '/api/v1/me'), http('GET', '/api/v1/catalog/items'), http('POST', '/api/v1/sales', { body: {} }), http('GET', `/api/v1/sales/${crypto.randomUUID()}`)]);
    log('B1 anonymous me/catalog/POST sales/GET sale →', anon.map((r) => r.status).join(' '));
    const pub = await Promise.all([http('GET', '/api/health'), http('GET', '/api/openapi.json'), http('GET', '/api/docs')]);
    log('B1 public routes health/openapi.json/docs →', pub.map((r) => r.status).join(' '));
    expect(su.status).toBeGreaterThanOrEqual(400); expect(after).toBe(before);
    expect(anon.every((r) => r.status === 401)).toBe(true);
  });
});

describe('B2 effective permission matrix — every demo role × every product route (HTTP)', () => {
  it('observed HTTP status equals what the role grants', async () => {
    const mismatches: string[] = [];
    const rows: string[] = [];
    const cashier = await login('cashier@nile.demo');
    const items = (await http('GET', '/api/v1/catalog/items', { cookie: cashier.cookie })).body.items;
    const variantId = items.flatMap((i: any) => i.variants).find((v: any) => v.sku === 'WTR-600').id;
    const sale = await http('POST', '/api/v1/sales', { cookie: cashier.cookie, body: { idempotencyKey: 'matrix-seed-1', lines: [{ variantId, quantity: '1' }] } });
    const saleId = sale.body.sale.id;
    for (const [i, a] of DEMO_ACCOUNTS.entries()) {
      const s = await login(a.email);
      const me = await http('GET', '/api/v1/me', { cookie: s.cookie });
      const cat = await http('GET', '/api/v1/catalog/items', { cookie: s.cookie });
      const post = await http('POST', '/api/v1/sales', { cookie: s.cookie, body: { idempotencyKey: `matrix-${i}-xxxx`, lines: [{ variantId, quantity: '1' }] } });
      const get = await http('GET', `/api/v1/sales/${saleId}`, { cookie: s.cookie });
      const exp = (p: any, ok: number) => (can(a.role, p) ? ok : 403);
      const expected = [200, exp({ catalog: ['read'] }, 200), exp({ sale: ['create'] }, 201), exp({ sale: ['read'] }, 200)];
      const observed = [me.status, cat.status, post.status, get.status];
      rows.push(`${a.role.padEnd(19)} me=${observed[0]} catalog=${observed[1]} POST sale=${observed[2]} GET sale=${observed[3]}  (server says role=${me.body.role}, tenant ok=${me.body.tenantId === demoId || me.body.tenant?.id === demoId})`);
      if (observed.join() !== expected.join()) mismatches.push(`${a.role}: observed ${observed} expected ${expected}`);
    }
    rows.forEach((r) => log('B2', r));
    log('B2 mismatches =', JSON.stringify(mismatches));
    expect(mismatches).toEqual([]);
  });
});

describe('B3 Better Auth organization endpoints — escalation attempts as cashier', () => {
  it('cannot escalate, create/delete orgs, switch into another tenant, or invite', async () => {
    const s = await login('cashier@nile.demo');
    const [me] = await opened.db.select({ id: member.id }).from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(user.email, 'cashier@nile.demo'));
    const probes: Record<string, any> = {
      'update-member-role self→owner': await http('POST', '/api/auth/organization/update-member-role', { cookie: s.cookie, body: { memberId: me!.id, role: 'owner', organizationId: demoId } }),
      'create organization': await http('POST', '/api/auth/organization/create', { cookie: s.cookie, body: { name: 'Mine', slug: `mine-${Date.now()}` } }),
      'update organization name': await http('POST', '/api/auth/organization/update', { cookie: s.cookie, body: { data: { name: 'Hacked' }, organizationId: demoId } }),
      'delete organization': await http('POST', '/api/auth/organization/delete', { cookie: s.cookie, body: { organizationId: demoId } }),
      'invite-member as owner': await http('POST', '/api/auth/organization/invite-member', { cookie: s.cookie, body: { email: 'evil@x.test', role: 'owner', organizationId: demoId } }),
      'remove-member (manager)': await http('POST', '/api/auth/organization/remove-member', { cookie: s.cookie, body: { memberIdOrEmail: 'pos-manager@nile.demo', organizationId: demoId } }),
      'set-active → other tenant': await http('POST', '/api/auth/organization/set-active', { cookie: s.cookie, body: { organizationId: otherId } }),
      'get-full-organization (other tenant)': await http('GET', `/api/auth/organization/get-full-organization?organizationId=${otherId}`, { cookie: s.cookie }),
      'list-members (own tenant)': await http('GET', '/api/auth/organization/list-members', { cookie: s.cookie }),
    };
    for (const [k, r] of Object.entries(probes)) log('B3', k.padEnd(38), r.status, String(r.body?.code ?? r.body?.message ?? (Array.isArray(r.body?.members) ? `${r.body.members.length} members` : '')).slice(0, 60));
    const [role] = await opened.db.select({ role: member.role }).from(member).where(eq(member.id, me!.id));
    const [org] = await opened.db.select({ name: organization.name }).from(organization).where(eq(organization.id, demoId));
    const orgs = Number((await opened.db.select({ n: sql<number>`count(*)` }).from(organization))[0]!.n);
    const meAfter = await http('GET', '/api/v1/me', { cookie: s.cookie });
    log('B3 after: cashier role =', role!.role, '; demo org name =', org!.name, '; org count =', orgs, '; /me tenant still demo =', JSON.stringify(meAfter.body).includes(demoId));
    expect(role!.role).toBe('cashier'); expect(orgs).toBe(2);
  });
});

describe('B4 shared demo account abuse (one anonymous visitor vs every other visitor)', () => {
  it('update-user / revoke-sessions / leave / change-password / delete-user', async () => {
    const victim = await login('waiter@nile.demo');            // another visitor using the same demo login
    const attacker = await login('waiter@nile.demo');
    const upd = await http('POST', '/api/auth/update-user', { cookie: attacker.cookie, body: { name: 'pwned name' } });
    const del = await http('POST', '/api/auth/delete-user', { cookie: attacker.cookie, body: {} });
    const rev = await http('POST', '/api/auth/revoke-sessions', { cookie: attacker.cookie, body: {} });
    const victimAfterRevoke = await http('GET', '/api/v1/me', { cookie: victim.cookie });
    const attacker2 = await login('waiter@nile.demo');
    const cp = await http('POST', '/api/auth/change-password', { cookie: attacker2.cookie, body: { currentPassword: 'demo1234', newPassword: 'locked-out-123', revokeOtherSessions: true } });
    const nextVisitor = await login('waiter@nile.demo');
    log('B4 update-user →', upd.status, '; delete-user →', del.status, '; revoke-sessions →', rev.status, '→ victim /me', victimAfterRevoke.status);
    log('B4 change-password →', cp.status, '→ next visitor login with demo1234 →', nextVisitor.status);
    // leave: kitchen leaves the tenant → shared login loses its membership
    const k = await login('kitchen@nile.demo');
    const leave = await http('POST', '/api/auth/organization/leave', { cookie: k.cookie, body: { organizationId: demoId } });
    const kNext = await login('kitchen@nile.demo');
    const kMe = await http('GET', '/api/v1/me', { cookie: kNext.cookie });
    log('B4 organization/leave →', leave.status, String(leave.body?.code ?? '').slice(0, 50), '→ next kitchen visitor /me', kMe.status);
  });
});

describe('B5 session lifecycle + membership revocation + CSRF', () => {
  it('sign-out kills the cookie; removed membership loses access immediately; cross-origin', async () => {
    const s = await login('storekeeper@nile.demo');
    const out = await http('POST', '/api/auth/sign-out', { cookie: s.cookie, body: {} });
    const afterOut = await http('GET', '/api/v1/me', { cookie: s.cookie });
    const m = await login('pos-manager@nile.demo');
    const before = await http('GET', '/api/v1/catalog/items', { cookie: m.cookie });
    const [mem] = await opened.db.select({ id: member.id, role: member.role }).from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(user.email, 'pos-manager@nile.demo'));
    await opened.db.update(member).set({ role: 'cashier' }).where(eq(member.id, mem!.id));
    const demoted = await http('GET', `/api/v1/me`, { cookie: m.cookie });
    await opened.db.delete(member).where(eq(member.id, mem!.id));
    const removed = await http('GET', '/api/v1/catalog/items', { cookie: m.cookie });
    log('B5 sign-out →', out.status, '→ old cookie /me', afterOut.status, '; manager catalog before', before.status, '→ after role change /me role =', demoted.body?.role, '→ after membership delete', removed.status);
    const c = await login('cashier@nile.demo');
    const items = (await http('GET', '/api/v1/catalog/items', { cookie: c.cookie })).body.items;
    const variantId = items[0].variants[0].id;
    const evilSale = await http('POST', '/api/v1/sales', { cookie: c.cookie, origin: 'https://evil.example', body: { idempotencyKey: 'csrf-test-1', lines: [{ variantId, quantity: '1' }] } });
    const evilAuth = await http('POST', '/api/auth/update-user', { cookie: c.cookie, origin: 'https://evil.example', body: { name: 'csrf' } });
    log('B5 cross-origin (Origin: evil) POST /api/v1/sales →', evilSale.status, '; POST /api/auth/update-user →', evilAuth.status);
    const sessions = Number((await opened.db.select({ n: sql<number>`count(*)` }).from(session))[0]!.n);
    log('B5 total sessions rows in DB =', sessions);
    expect(afterOut.status).toBe(401); expect(removed.status).toBe(403);
  });
});
