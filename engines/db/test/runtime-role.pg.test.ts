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
  const r = {
    owner: `g7_owner_${suffix}`,
    login: `g7_login_${suffix}`,
    stranger: `g7_stranger_${suffix}`,
    bypass: `g7_bypass_${suffix}`,
    // logins for the "can become a more powerful role" cases
    viaOwner: `g7_via_owner_${suffix}`,
    viaBypass: `g7_via_bypass_${suffix}`,
    dbOwner: `g7_db_owner_${suffix}`,
    granted: `g7_granted_${suffix}`,
    writeAll: `g7_write_all_${suffix}`,
    noInherit: `g7_noinherit_${suffix}`,
  };
  // NOLOGIN intermediate roles (dropped after the logins)
  const mid = { toOwner: `g7_mid_owner_${suffix}`, toBypass: `g7_mid_bypass_${suffix}`, bypassRole: `g7_bypass_role_${suffix}`, extra: `g7_extra_${suffix}` };
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
    for (const login of [r.viaOwner, r.viaBypass, r.dbOwner, r.granted, r.writeAll]) {
      await admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`);
    }
    // NOINHERIT: holds no privileges of its roles until it SETs ROLE to one of them.
    await admin.query(`CREATE ROLE ${r.noInherit} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`);
    await admin.query(`CREATE ROLE ${mid.toOwner} NOLOGIN; GRANT ${r.owner} TO ${mid.toOwner}; GRANT ${mid.toOwner} TO ${r.viaOwner}`);
    await admin.query(`CREATE ROLE ${mid.bypassRole} NOLOGIN BYPASSRLS; CREATE ROLE ${mid.toBypass} NOLOGIN`);
    await admin.query(`GRANT ${mid.bypassRole} TO ${mid.toBypass}; GRANT ${mid.toBypass} TO ${r.viaBypass}`);
    await admin.query(`CREATE ROLE ${mid.extra} NOLOGIN; GRANT ${mid.extra} TO ${r.noInherit}`);
    await admin.query(`GRANT pg_write_all_data TO ${r.writeAll}`);
    await admin.query(`CREATE DATABASE ${dbName} OWNER ${r.owner}`);
    // Production setup: the runtime role exists and the runtime login is a member.
    await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}') THEN
      CREATE ROLE ${RUNTIME_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; END IF; END $$`);
    await admin.query(
      `GRANT ${RUNTIME_ROLE} TO ${r.login}, ${r.bypass}, ${r.viaOwner}, ${r.viaBypass}, ${r.dbOwner}, ${r.granted}, ${r.writeAll}, ${r.noInherit}`,
    );
    // Migrate once as the non-superuser owner (the production migration model).
    const opened = await openPostgres({ url: urlFor(r.login), migrationUrl: urlFor(r.owner) });
    await opened.close();
    // Privileges nile_app does not have (it has no DELETE on "user"; see migration 0001).
    const onTestDb = new pg.Client({ connectionString: urlFor() });
    await onTestDb.connect();
    try {
      await onTestDb.query(`GRANT DELETE ON "user" TO ${r.granted}`);
      await onTestDb.query(`GRANT DELETE ON "user" TO ${mid.extra}`);
    } finally {
      await onTestDb.end();
    }
  });

  afterAll(async () => {
    process.off('unhandledRejection', onUnhandled);
    if (!admin) return;
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    for (const role of Object.values(r)) {
      await admin.query(`REVOKE ${RUNTIME_ROLE} FROM ${role}`).catch(() => undefined);
    }
    for (const role of [...Object.values(r).filter((x) => x !== r.owner), ...Object.values(mid), r.owner]) {
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
      // SET ROLE NONE does return to the login; the login must gain nothing nile_app lacks.
      for (const forbidden of [sql`DELETE FROM "user"`, sql`DROP TABLE audit_log`, sql`ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY`]) {
        await expect(
          opened.db.transaction(async (tx) => {
            await tx.execute(sql`SET LOCAL ROLE NONE`);
            await tx.execute(forbidden);
          }),
        ).rejects.toThrow();
      }
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
      await expect(openPostgres({ url: urlFor(r.owner) })).rejects.toThrow(/owns/);
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

  it('a login that can become the table owner through an intermediate role is refused', async () => {
    await expect(openPostgres({ url: urlFor(r.viaOwner) })).rejects.toThrow(/owns/);
  });

  it('a login that can become a BYPASSRLS role through an intermediate role is refused', async () => {
    await expect(openPostgres({ url: urlFor(r.viaBypass) })).rejects.toThrow(/superuser or BYPASSRLS/);
  });

  it('a login that owns the database (it could drop tables in its schemas) is refused', async () => {
    await admin.query(`ALTER DATABASE ${dbName} OWNER TO ${r.dbOwner}`);
    try {
      await expect(openPostgres({ url: urlFor(r.dbOwner) })).rejects.toThrow(/owns, or can become the owner of, database /);
    } finally {
      await admin.query(`ALTER DATABASE ${dbName} OWNER TO ${r.owner}`);
    }
  });

  it('a login holding a table privilege that nile_app lacks is refused', async () => {
    await expect(openPostgres({ url: urlFor(r.granted) })).rejects.toThrow(/DELETE on public\.user/);
  });

  it('a member of pg_write_all_data is refused', async () => {
    await expect(openPostgres({ url: urlFor(r.writeAll) })).rejects.toThrow(/privilege that "nile_app" lacks/);
  });

  it('a NOINHERIT login that can SET ROLE to a more privileged role is refused', async () => {
    await expect(openPostgres({ url: urlFor(r.noInherit) })).rejects.toThrow(/privilege that "nile_app" lacks/);
  });

  it('a login that may CREATE in a schema or in the database (nile_app may not) is refused', async () => {
    const onTestDb = new pg.Client({ connectionString: urlFor() });
    await onTestDb.connect();
    try {
      await onTestDb.query(`GRANT CREATE ON SCHEMA public TO ${r.login}`);
      await expect(openPostgres({ url: urlFor(r.login) })).rejects.toThrow(/CREATE on schema public/);
      await onTestDb.query(`REVOKE CREATE ON SCHEMA public FROM ${r.login}`);
      await onTestDb.query(`GRANT CREATE ON DATABASE ${dbName} TO ${r.login}`);
      await expect(openPostgres({ url: urlFor(r.login) })).rejects.toThrow(/CREATE on database/);
    } finally {
      await onTestDb.query(`REVOKE CREATE ON SCHEMA public FROM ${r.login}`);
      await onTestDb.query(`REVOKE CREATE ON DATABASE ${dbName} FROM ${r.login}`);
      await onTestDb.end();
    }
    const ok = await openPostgres({ url: urlFor(r.login) }); // and the same login starts again once revoked
    await ok.close();
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
