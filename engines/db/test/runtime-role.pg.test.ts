/**
 * G-7 on real PostgreSQL, through the production path (openPostgres).
 *
 * Runs only when NILE_TEST_PG_ADMIN_URL points at a DISPOSABLE server and a
 * superuser login, e.g.
 *   NILE_TEST_PG_ADMIN_URL=postgres://postgres@127.0.0.1:5433/postgres \
 *     npx vitest run engines/db/test/runtime-role.pg.test.ts
 * Otherwise it is reported as skipped. It creates a randomly named database
 * and roles (throwaway passwords generated per run) and drops them afterwards;
 * the cluster-wide `nile_app` role is created if missing and left in place.
 */
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertRuntimeRole, openPostgres, RUNTIME_ROLE, UnsafeRuntimeRoleError } from '../open.js';

const ADMIN_URL = process.env.NILE_TEST_PG_ADMIN_URL;

describe.skipIf(!ADMIN_URL)('runtime role on real PostgreSQL (G-7)', () => {
  const suffix = randomBytes(4).toString('hex');
  const dbName = `nile_g7_${suffix}`;
  const r = { owner: `g7_owner_${suffix}`, login: `g7_login_${suffix}`, stranger: `g7_stranger_${suffix}`, bypass: `g7_bypass_${suffix}` };
  const password = randomBytes(12).toString('hex');
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => void unhandled.push(e);
  let admin: pg.Client;

  const urlFor = (user?: string) => {
    const u = new URL(ADMIN_URL!);
    if (user) {
      u.username = user;
      u.password = password;
    }
    u.pathname = `/${dbName}`;
    return u.toString();
  };

  beforeAll(async () => {
    process.on('unhandledRejection', onUnhandled);
    admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    const su = (await admin.query(`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`)).rows[0];
    if (!su?.rolsuper) throw new Error('NILE_TEST_PG_ADMIN_URL must be a superuser on a disposable server');
    await admin.query(`CREATE ROLE ${r.owner} LOGIN CREATEROLE NOSUPERUSER PASSWORD '${password}'`);
    await admin.query(`CREATE ROLE ${r.login} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`);
    await admin.query(`CREATE ROLE ${r.stranger} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`);
    await admin.query(`CREATE ROLE ${r.bypass} LOGIN NOSUPERUSER BYPASSRLS PASSWORD '${password}'`);
    await admin.query(`CREATE DATABASE ${dbName} OWNER ${r.owner}`);
    // Production setup: the runtime role exists and the runtime login is a member.
    await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}') THEN
      CREATE ROLE ${RUNTIME_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; END IF; END $$`);
    await admin.query(`GRANT ${RUNTIME_ROLE} TO ${r.login}, ${r.bypass}`);
    // Migrate once as the non-superuser owner (the production migration model).
    const opened = await openPostgres({ url: urlFor(r.login), migrationUrl: urlFor(r.owner) });
    await opened.close();
  });

  afterAll(async () => {
    process.off('unhandledRejection', onUnhandled);
    if (!admin) return;
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    for (const role of Object.values(r)) {
      await admin.query(`REVOKE ${RUNTIME_ROLE} FROM ${role}`).catch(() => undefined);
      await admin.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await admin.end();
  });

  it('a member login starts, and every pooled connection runs as nile_app (RESET ROLE included)', async () => {
    const opened = await openPostgres({ url: urlFor(r.login) });
    try {
      expect(await assertRuntimeRole(opened.db, { checkLogin: true })).toBe(RUNTIME_ROLE);
      const rows = await Promise.all(
        Array.from({ length: 8 }, async () => {
          const res = (await opened.db.execute(
            sql`SELECT current_user AS u, session_user AS s, pg_backend_pid() AS pid, pg_sleep(0.05)`,
          )) as unknown as { rows: Array<{ u: string; s: string; pid: number }> };
          return res.rows[0]!;
        }),
      );
      expect(new Set(rows.map((x) => x.u))).toEqual(new Set([RUNTIME_ROLE]));
      expect(new Set(rows.map((x) => x.s))).toEqual(new Set([r.login]));
      expect(new Set(rows.map((x) => x.pid)).size).toBeGreaterThan(1); // really several connections
      const afterReset = await opened.db.transaction(async (tx) => {
        await tx.execute(sql`RESET ROLE`);
        return ((await tx.execute(sql`SELECT current_user AS u`)) as unknown as { rows: Array<{ u: string }> }).rows[0]!.u;
      });
      expect(afterReset).toBe(RUNTIME_ROLE); // the role is a connection startup setting, not a revertible SET
    } finally {
      await opened.close();
    }
  });

  it('the migration owner used as the runtime login is refused (the G-7 scenario)', async () => {
    // Not a member of nile_app: the connection itself is refused.
    await expect(openPostgres({ url: urlFor(r.owner) })).rejects.toBeInstanceOf(UnsafeRuntimeRoleError);
    // Even as a member it must be refused: it owns the tables and could SET ROLE back to itself.
    await admin.query(`GRANT ${RUNTIME_ROLE} TO ${r.owner}`);
    try {
      await expect(openPostgres({ url: urlFor(r.owner) })).rejects.toThrow(/owns tables/);
    } finally {
      await admin.query(`REVOKE ${RUNTIME_ROLE} FROM ${r.owner}`);
    }
  });

  it('a login that is not a member of nile_app is refused with a clear error that leaks no secret', async () => {
    const err = await openPostgres({ url: urlFor(r.stranger) }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UnsafeRuntimeRoleError);
    expect((err as Error).message).toMatch(/cannot assume the runtime role "nile_app" \(42501/);
    // node-postgres errors carry the client (with the password): it must not be attached or quoted.
    expect((err as Error).cause).toBeUndefined();
    expect(JSON.stringify(err) + String((err as Error).message) + String((err as Error).stack)).not.toContain(password);
  });

  it('a superuser login is refused even though it can assume nile_app', async () => {
    await expect(openPostgres({ url: urlFor() })).rejects.toThrow(/superuser or BYPASSRLS/);
  });

  it('a BYPASSRLS login is refused even when it is a member of nile_app, and leaves no connection open', async () => {
    await expect(openPostgres({ url: urlFor(r.bypass) })).rejects.toThrow(/superuser or BYPASSRLS/);
    // The refused pool must be closed, not left holding a privileged session.
    let open = -1;
    for (let i = 0; i < 20 && open !== 0; i++) {
      if (i) await new Promise((res) => setTimeout(res, 50));
      open = Number((await admin.query(`SELECT count(*) AS n FROM pg_stat_activity WHERE usename = $1`, [r.bypass])).rows[0].n);
    }
    expect(open).toBe(0);
  });

  it('a DATABASE_URL whose own options= overrides the startup role is refused', async () => {
    const u = new URL(urlFor(r.login));
    u.searchParams.set('options', `-c role=${r.login}`); // the login may always "become" itself
    await expect(openPostgres({ url: u.toString() })).rejects.toThrow(/expected "nile_app"/);
  });

  it('no failure above surfaced as an unhandled promise rejection', () => {
    expect(unhandled).toEqual([]);
  });
});
