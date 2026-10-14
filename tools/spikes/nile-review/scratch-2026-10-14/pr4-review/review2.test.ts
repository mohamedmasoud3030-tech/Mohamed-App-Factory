/** PR #4 independent-style re-review, round 2 — scratch, never committed. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPglite, type OpenedDatabase } from '../engines/db/open.js';
import { createAuth } from '../engines/platform/src/auth/auth.js';
import { createApp, type CreatedApp } from '../apps/api/src/app.js';
import { demoTenantSpec, provisionTenant } from '../apps/api/src/provision.js';
import { DEMO_ACCOUNTS } from '../engines/platform/src/demo-seed.js';

const BASE = 'http://localhost:3000';
let opened: OpenedDatabase; let created: CreatedApp; let demoOrg: string;
const log = (...a: unknown[]) => console.log('OBSERVED:', ...a);
async function http(method: string, url: string, o: { cookie?: string; body?: unknown } = {}) {
  const r = await created.app.getHttpAdapter().getInstance().inject({ method: method as 'GET', url,
    headers: { origin: BASE, ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}) },
    payload: o.body === undefined ? undefined : JSON.stringify(o.body) });
  let body: any = r.body; try { body = JSON.parse(r.body); } catch { /* */ }
  return { status: r.statusCode, body };
}
async function login(email: string, password = 'demo1234') {
  const r = await created.app.getHttpAdapter().getInstance().inject({ method: 'POST', url: '/api/auth/sign-in/email',
    headers: { origin: BASE, 'content-type': 'application/json' }, payload: JSON.stringify({ email, password }) });
  const raw = r.headers['set-cookie']; const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return { status: r.statusCode, cookie: list.map((c) => String(c).split(';')[0]).join('; ') };
}
beforeAll(async () => {
  opened = await openPglite();
  const auth = createAuth(opened.db, { baseURL: BASE, secret: 'r'.repeat(48), trustedOrigins: [BASE] });
  demoOrg = (await provisionTenant(auth, opened.db, demoTenantSpec())).tenantId;
  created = await createApp({ db: opened.db, auth }, { logger: false });
});
afterAll(async () => { await created.app.close(); await opened.close(); });

describe('PR #4 round 2', () => {
  it('R5 token from list-sessions cannot be used with revoke-session to kick another visitor', async () => {
    const victim = await login('cashier@nile.demo');
    const attacker = await login('cashier@nile.demo');
    const sessions = (await http('GET', '/api/auth/list-sessions', { cookie: attacker.cookie })).body as any[];
    const victimRaw = decodeURIComponent(victim.cookie.split('=')[1]!);
    const token = sessions.map((s) => s.token).find((t: string) => victimRaw.startsWith(t + '.'));
    const r = await http('POST', '/api/auth/revoke-session', { cookie: attacker.cookie, body: { token } });
    const victimMe = await http('GET', '/api/v1/me', { cookie: victim.cookie });
    log('R5 revoke-session(victim token) →', r.status, r.body?.code, '| victim /me →', victimMe.status);
    expect(r.status).toBe(403); expect(victimMe.status).toBe(200);
  });

  it('R6 locked paths not exercised by the committed test: change-email, delete-user', async () => {
    const s = await login('waiter@nile.demo');
    const ce = await http('POST', '/api/auth/change-email', { cookie: s.cookie, body: { newEmail: 'x@evil.test' } });
    const du = await http('POST', '/api/auth/delete-user', { cookie: s.cookie, body: { password: 'demo1234' } });
    log('R6 change-email →', ce.status, ce.body?.code, '| delete-user →', du.status, du.body?.code);
    expect([403, 404]).toContain(ce.status); expect([403, 404]).toContain(du.status);
    expect((await login('waiter@nile.demo')).status).toBe(200);
  });

  it('R7 every demo login × every organization-mutating endpoint is refused and the demo org survives', async () => {
    const members = await opened.db.execute(`SELECT id, user_id, role FROM member WHERE organization_id = '${demoOrg}'` as any) as any;
    const someMember = members.rows[0];
    const results: Record<string, number> = {};
    for (const a of DEMO_ACCOUNTS) {
      const { cookie } = await login(a.email);
      const calls: Array<[string, unknown]> = [
        ['/api/auth/organization/update', { organizationId: demoOrg, data: { name: 'pwned' } }],
        ['/api/auth/organization/delete', { organizationId: demoOrg }],
        ['/api/auth/organization/remove-member', { organizationId: demoOrg, memberIdOrEmail: someMember.id }],
        ['/api/auth/organization/update-member-role', { organizationId: demoOrg, memberId: someMember.id, role: 'owner' }],
        ['/api/auth/organization/invite-member', { organizationId: demoOrg, email: 'x@evil.test', role: 'owner' }],
        ['/api/auth/organization/create', { name: 'x', slug: 'x-' + a.role }],
        ['/api/auth/organization/create-role', { organizationId: demoOrg, role: 'x', permission: { sale: ['void'] } }],
      ];
      for (const [url, body] of calls) {
        const r = await http('POST', url, { cookie, body });
        const k = `${url.split('/').pop()} ${r.status}`; results[k] = (results[k] ?? 0) + 1;
        expect(r.status, `${a.email} ${url}`).toBeGreaterThanOrEqual(400);
      }
    }
    log('R7 status histogram over', DEMO_ACCOUNTS.length, 'logins:', JSON.stringify(results));
    const after = await opened.db.execute(`SELECT (SELECT name FROM organization WHERE id='${demoOrg}') AS name, (SELECT count(*) FROM member WHERE organization_id='${demoOrg}') AS n, (SELECT count(*) FROM member WHERE organization_id='${demoOrg}' AND role='owner') AS owners, (SELECT count(*) FROM organization) AS orgs` as any) as any;
    log('R7 after: org name', after.rows[0].name, '| members', after.rows[0].n, '(before', members.rows.length + ') | owners', after.rows[0].owners, '| orgs', after.rows[0].orgs);
    expect(Number(after.rows[0].n)).toBe(members.rows.length);
  });
});
