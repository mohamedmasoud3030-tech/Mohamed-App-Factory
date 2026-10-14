/** PR #4 adversarial review — scratch, never committed. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPglite, type OpenedDatabase } from '../engines/db/open.js';
import { createAuth } from '../engines/platform/src/auth/auth.js';
import { createApp, type CreatedApp } from '../apps/api/src/app.js';
import { demoTenantSpec, provisionTenant } from '../apps/api/src/provision.js';

const BASE = 'http://localhost:3000';
let opened: OpenedDatabase; let created: CreatedApp; let otherOrg: string;
const log = (...a: unknown[]) => console.log('OBSERVED:', ...a);
async function http(method: string, url: string, o: { cookie?: string; body?: unknown } = {}) {
  const r = await created.app.getHttpAdapter().getInstance().inject({ method: method as 'GET', url,
    headers: { origin: BASE, ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}) },
    payload: o.body === undefined ? undefined : JSON.stringify(o.body) });
  let body: any = r.body; try { body = JSON.parse(r.body); } catch { /* */ }
  return { status: r.statusCode, body, headers: r.headers };
}
async function login(email: string, password = 'demo1234') {
  const r = await http('POST', '/api/auth/sign-in/email', { body: { email, password } });
  const raw = r.headers['set-cookie']; const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return { status: r.status, cookie: list.map((c) => String(c).split(';')[0]).join('; ') };
}
beforeAll(async () => {
  opened = await openPglite();
  const auth = createAuth(opened.db, { baseURL: BASE, secret: 'r'.repeat(48), trustedOrigins: [BASE] });
  await provisionTenant(auth, opened.db, demoTenantSpec());
  otherOrg = (await provisionTenant(auth, opened.db, { slug: 'o', name: 'O', password: 'other-pass-123', accounts: [{ role: 'cashier', email: 'c@o.test' }], catalog: [] })).tenantId;
  created = await createApp({ db: opened.db, auth }, { logger: false });
});
afterAll(async () => { await created.app.close(); await opened.close(); });

describe('PR #4 review', () => {
  it('R4 unlink-account with a valid body, and use of a leaked session token', async () => {
    const victim = await login('employee@nile.demo');
    const s = await login('employee@nile.demo');
    const accts = (await http('GET', '/api/auth/list-accounts', { cookie: s.cookie })).body;
    const unlink = await http('POST', '/api/auth/unlink-account', { cookie: s.cookie, body: { providerId: 'credential', accountId: accts[0].accountId } });
    const next = await login('employee@nile.demo');
    log('R4 unlink-account(credential, accountId) →', unlink.status, String(unlink.body?.code ?? unlink.body?.status ?? ''), '→ next visitor login', next.status);
    const sessions = (await http('GET', '/api/auth/list-sessions', { cookie: s.cookie })).body as any[];
    const victimRaw = decodeURIComponent(victim.cookie.split('=')[1]!);
    const leaked = sessions.map((x) => x.token).find((t: string) => victimRaw.startsWith(t + '.'))!;
    const forged = await http('GET', '/api/v1/me', { cookie: `better-auth.session_token=${leaked}` });
    const bearer = await created.app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/api/v1/me', headers: { authorization: `Bearer ${leaked}` } });
    log('R4 leaked raw token as cookie (unsigned) → /me', forged.status, '| as Bearer →', bearer.statusCode, '| cookie = token + HMAC signature:', victimRaw.length > leaked.length + 10);
    expect(next.status).toBe(200);
  });

  it('R1 path-variant bypass attempts against the shared-account lock', async () => {
    const body = { currentPassword: 'demo1234', newPassword: 'bypass-12345', revokeOtherSessions: false };
    for (const url of ['/api/auth/change-password/', '/api/auth/CHANGE-PASSWORD', '/api/auth//change-password', '/api/auth/change-password?x=1', '/api/auth/change%2Dpassword', '/api/auth/./change-password']) {
      const s = await login('waiter@nile.demo');
      const r = await http('POST', url, { cookie: s.cookie, body });
      const still = (await login('waiter@nile.demo')).status;
      log('R1', url.padEnd(36), '→', r.status, String(r.body?.code ?? '').slice(0, 30), '| demo1234 still works:', still === 200);
      expect(still).toBe(200);
    }
  });

  it('R2 account-affecting endpoints NOT in the lock list', async () => {
    const victim = await login('kitchen@nile.demo');
    const s = await login('kitchen@nile.demo');
    const accts = await http('GET', '/api/auth/list-accounts', { cookie: s.cookie });
    const sess = await http('GET', '/api/auth/list-sessions', { cookie: s.cookie });
    const tokenLeak = JSON.stringify(sess.body).match(/"token":"[^"]{8,}/) ? 'YES (session tokens returned)' : 'no';
    log('R2 list-accounts →', accts.status, JSON.stringify(accts.body).slice(0, 90));
    log('R2 list-sessions →', sess.status, Array.isArray(sess.body) ? `${sess.body.length} sessions` : '', '| tokens exposed:', tokenLeak);
    const unlink = await http('POST', '/api/auth/unlink-account', { cookie: s.cookie, body: { providerId: 'credential' } });
    const reset = await http('POST', '/api/auth/request-password-reset', { body: { email: 'kitchen@nile.demo', redirectTo: '/' } });
    const verify = await http('POST', '/api/auth/send-verification-email', { cookie: s.cookie, body: { email: 'kitchen@nile.demo' } });
    const upd = await http('POST', '/api/auth/update-session', { cookie: s.cookie, body: { activeOrganizationId: otherOrg } });
    const meAfterUpd = await http('GET', '/api/v1/me', { cookie: s.cookie });
    const otherCatalog = await http('GET', '/api/v1/catalog/items', { cookie: s.cookie });
    log('R2 unlink-account(credential) →', unlink.status, String(unlink.body?.code ?? '').slice(0, 40));
    log('R2 request-password-reset →', reset.status, String(reset.body?.code ?? reset.body?.message ?? '').slice(0, 50));
    log('R2 send-verification-email →', verify.status, String(verify.body?.code ?? '').slice(0, 40));
    log('R2 update-session(activeOrganizationId=other tenant) →', upd.status, String(upd.body?.code ?? '').slice(0, 40), '→ /me', meAfterUpd.status, meAfterUpd.body?.error ?? meAfterUpd.body?.tenant?.slug, '| catalog', otherCatalog.status, Array.isArray(otherCatalog.body?.items) ? `${otherCatalog.body.items.length} items` : otherCatalog.body?.error);
    const next = await login('kitchen@nile.demo');
    const victimMe = await http('GET', '/api/v1/me', { cookie: victim.cookie });
    log('R2 afterwards: next visitor login →', next.status, '| earlier visitor /me →', victimMe.status);
    expect(next.status).toBe(200);
    expect(meAfterUpd.body?.tenant?.slug).toBe('nile-demo'); // stayed in own tenant
  });

  it('R3 email-case variant of a demo account', async () => {
    const s = await login('WAITER@NILE.DEMO');
    const r = await http('POST', '/api/auth/update-user', { cookie: s.cookie, body: { name: 'x' } });
    log('R3 login with upper-case email →', s.status, '; update-user →', r.status, String(r.body?.code ?? ''));
  });
});
