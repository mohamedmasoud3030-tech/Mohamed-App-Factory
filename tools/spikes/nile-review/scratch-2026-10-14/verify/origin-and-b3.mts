// Outside vitest (NODE_ENV not "test") so Better Auth's origin check is live.
import { eq } from 'drizzle-orm';
import { openPostgres } from '../engines/db/open.ts';
import { createAuth } from '../engines/platform/src/auth/auth.ts';
import { session, user } from '../engines/platform/src/auth/schema.ts';
import { createApp } from '../apps/api/src/app.ts';
import { demoTenantSpec, provisionTenant } from '../apps/api/src/provision.ts';

const BASE = 'http://localhost:3000';
console.log('NODE_ENV =', JSON.stringify(process.env.NODE_ENV));
const opened = await openPostgres({ url: 'postgres://nile_login@127.0.0.1:5433/nile' });
const auth = createAuth(opened.db, { baseURL: BASE, secret: 'y'.repeat(48), trustedOrigins: [BASE], production: false });
const demoId = (await provisionTenant(auth, opened.db, demoTenantSpec())).tenantId;
const created = await createApp({ db: opened.db, auth }, { logger: false });
const inject = async (method: string, url: string, o: { cookie?: string; body?: unknown; origin?: string } = {}) => {
  const r = await created.app.getHttpAdapter().getInstance().inject({ method: method as 'GET', url, headers: { ...(o.origin !== undefined ? { origin: o.origin } : {}), ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}) }, payload: o.body === undefined ? undefined : JSON.stringify(o.body) });
  let body: any = r.body; try { body = JSON.parse(r.body); } catch { /* */ }
  return { status: r.statusCode, body, headers: r.headers };
};
const login = async (email: string) => {
  const r = await inject('POST', '/api/auth/sign-in/email', { origin: BASE, body: { email, password: 'demo1234' } });
  const raw = r.headers['set-cookie']; const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => String(c).split(';')[0]).join('; ');
};

// --- origin check, fixed trustedOrigins (production-style list) ---
const c = await login('reception@nile.demo');
for (const origin of ['https://evil.example', BASE, undefined]) {
  const r = await inject('POST', '/api/auth/update-user', { cookie: c, origin, body: { name: 'probe' } });
  console.log(`ORIGIN fixed-list  POST /api/auth/update-user  Origin=${origin ?? '(none)'} →`, r.status, r.body?.code ?? '');
}
const evilSignIn = await inject('POST', '/api/auth/sign-in/email', { origin: 'https://evil.example', body: { email: 'reception@nile.demo', password: 'demo1234' } });
console.log('ORIGIN fixed-list  POST sign-in Origin=evil →', evilSignIn.status, evilSignIn.body?.code ?? '');

// --- B3 anomaly: which call changes the session's active organization? ---
const s = await login('cashier@nile.demo');
const tok = async () => {
  const rows = await opened.db.select({ a: session.activeOrganizationId }).from(session).innerJoin(user, eq(user.id, session.userId)).where(eq(user.email, 'cashier@nile.demo'));
  return rows.map((r) => (r.a === demoId ? 'demo' : r.a === null ? 'NULL' : r.a)).join(',');
};
const meT = async () => { const r = await inject('GET', '/api/v1/me', { cookie: s, origin: BASE }); return `${r.status}/${r.body?.tenant?.id === demoId ? 'demo' : JSON.stringify(r.body?.tenant ?? r.body?.error)}`; };
console.log('B3diag after login: session.active =', await tok(), '; /me =', await meT());
const lm = await inject('GET', '/api/auth/organization/list-members', { cookie: s, origin: BASE });
console.log('B3diag list-members →', lm.status, lm.body?.code ?? `${lm.body?.members?.length} members`);
const fake = crypto.randomUUID();
const sa = await inject('POST', '/api/auth/organization/set-active', { cookie: s, origin: BASE, body: { organizationId: fake } });
console.log('B3diag set-active(non-member org) →', sa.status, sa.body?.code ?? '', '; session.active =', await tok(), '; /me =', await meT());
const sn = await inject('POST', '/api/auth/organization/set-active', { cookie: s, origin: BASE, body: { organizationId: null } });
console.log('B3diag set-active(null) →', sn.status, '; session.active =', await tok(), '; /me =', await meT());
const sd = await inject('POST', '/api/auth/organization/set-active', { cookie: s, origin: BASE, body: { organizationId: demoId } });
console.log('B3diag set-active(demo) →', sd.status, '; session.active =', await tok(), '; /me =', await meT());
await created.app.close(); await opened.close();
export {};
