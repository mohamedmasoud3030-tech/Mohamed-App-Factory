/**
 * Finding N-1 on real PostgreSQL: a runtime pool with no 'error' listener.
 *
 * When PostgreSQL terminates an idle pooled connection — a server restart, an
 * administrator `pg_terminate_backend`, a provider recycling the backend —
 * pg-pool purges that client and then emits 'error' on the pool. With no
 * listener that emit is an unhandled 'error' event, so Node exits: an idle
 * connection being killed took the whole API process down (observed
 * 2026-10-14, PostgreSQL 18.4, pg 8.23.1, SQLSTATE 57P01).
 *
 * Runs only when NILE_TEST_PG_ADMIN_URL points at a DISPOSABLE server whose
 * login can create a database and roles (a superuser on a throwaway local
 * cluster is what the local matrix uses):
 *   NILE_TEST_PG_ADMIN_URL=postgres://postgres@127.0.0.1:5471/postgres \
 *     npx vitest run engines/db/test/pool-resilience.pg.test.ts
 * Otherwise it is reported as skipped. Roles, the database and the throwaway
 * password are created per run and dropped afterwards; the cluster-wide
 * `nile_app` role is created only if missing and is left in place.
 *
 * The idle backend is killed by the runtime login itself — a backend's owner
 * may signal it — so this part needs no superuser.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openPostgres, RUNTIME_ROLE, type OpenedDatabase } from '../open.js';

const ADMIN_URL = process.env.NILE_TEST_PG_ADMIN_URL;
const CHILD = fileURLToPath(new URL('./fixtures/pool-error-child.ts', import.meta.url));
// engines/db/test/ → repo root is three levels up.
const TSX = fileURLToPath(new URL('../../../node_modules/.bin/tsx', import.meta.url));

describe.skipIf(!ADMIN_URL)('pool resilience on real PostgreSQL (N-1)', () => {
  const suffix = randomBytes(4).toString('hex');
  const dbName = `nile_n1_${suffix}`;
  const r = { owner: `n1_owner_${suffix}`, login: `n1_login_${suffix}` };
  // Throwaway password for this run only. Asserted never to reach a log line.
  const password = randomBytes(12).toString('hex');
  let admin: pg.Client;
  let createdRuntimeRole = false;
  let opened: OpenedDatabase | undefined;

  const urlFor = (user: string) => {
    const u = new URL(ADMIN_URL!);
    u.username = user;
    u.password = password;
    u.pathname = `/${dbName}`;
    return u.toString();
  };
  const loginUrl = () => urlFor(r.login);
  const poolOf = (o: OpenedDatabase) => (o.db as unknown as { $client: pg.Pool }).$client;

  /** Idle backends of the runtime login in this database, excluding our own. */
  async function idleBackendPids(): Promise<number[]> {
    const c = new pg.Client({ connectionString: loginUrl() });
    await c.connect();
    try {
      const res = await c.query(
        `SELECT pid FROM pg_stat_activity
          WHERE pid <> pg_backend_pid()
            AND datname = current_database()
            AND usename = current_user
            AND state = 'idle'`,
      );
      return res.rows.map((row: { pid: number }) => Number(row.pid));
    } finally {
      await c.end();
    }
  }

  async function terminateAll(pids: number[]) {
    const c = new pg.Client({ connectionString: loginUrl() });
    await c.connect();
    try {
      for (const pid of pids) await c.query('SELECT pg_terminate_backend($1)', [pid]);
    } finally {
      await c.end();
    }
  }

  /** Run the child harness; returns its exit status, stdout, stderr and any spawn error. */
  function runChild(strip: boolean) {
    const res = { status: 0 as number | null, stdout: '', stderr: '', spawnError: '' };
    try {
      const out = execFileSync(TSX, [CHILD], {
        encoding: 'utf8',
        timeout: 90_000,
        env: {
          ...process.env,
          NILE_CHILD_URL: loginUrl(),
          ...(strip ? { NILE_CHILD_STRIP: '1' } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      res.stdout = out ?? '';
    } catch (e) {
      const err = e as {
        status?: number | null;
        stdout?: string;
        stderr?: string;
        signal?: string;
        message?: string;
        code?: string;
      };
      res.status = err.status ?? (err.signal ? 1 : null);
      res.stdout = err.stdout ?? '';
      res.stderr = err.stderr ?? '';
      res.spawnError = `${err.code ?? ''} ${err.message ?? ''}`.trim();
    }
    return res;
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    const me = (await admin.query(`SELECT rolname, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user`)).rows[0];
    if (!me || !(me.rolsuper || (me.rolcreatedb && me.rolcreaterole))) {
      throw new Error('NILE_TEST_PG_ADMIN_URL must be able to create a database and roles on a disposable server');
    }
    await admin.query(`CREATE ROLE ${r.owner} LOGIN CREATEROLE NOSUPERUSER PASSWORD '${password}'`);
    await admin.query(`CREATE ROLE ${r.login} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`);
    createdRuntimeRole = !(await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}'`)).rows.length;
    if (createdRuntimeRole) {
      await admin.query(`CREATE ROLE ${RUNTIME_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    }
    await admin.query(`GRANT ${RUNTIME_ROLE} TO ${r.login}`);
    await admin.query(`CREATE DATABASE ${dbName} OWNER ${r.owner}`);
    // Migrate once as the non-superuser owner (the production migration model).
    const migrated = await openPostgres({ url: loginUrl(), migrationUrl: urlFor(r.owner) });
    await migrated.close();
    opened = await openPostgres({ url: loginUrl() });
  });

  afterAll(async () => {
    if (opened) await opened.close().catch(() => {});
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
      await admin.query(`DROP ROLE IF EXISTS ${r.owner}, ${r.login}`).catch(() => {});
      if (createdRuntimeRole) await admin.query(`DROP ROLE IF EXISTS ${RUNTIME_ROLE}`).catch(() => {});
      await admin.end().catch(() => {});
    }
  });

  it('openPostgres attaches an error listener to the runtime pool', () => {
    expect(poolOf(opened!).listenerCount('error')).toBe(1);
  });

  it('the pool survives an idle backend being terminated and keeps serving as nile_app', async () => {
    const before = await idleBackendPids();
    expect(before.length).toBeGreaterThan(0);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await terminateAll(before);
      await new Promise((resolve) => setTimeout(resolve, 800));

      // The process is still here: the emit was handled, not thrown.
      const res = (await opened!.db.execute(sql`SELECT current_user AS role`)) as unknown as {
        rows: Array<{ role: string }>;
      };
      expect(res.rows[0]?.role).toBe(RUNTIME_ROLE);

      // The killed client was purged and replaced by a new backend.
      const after = await idleBackendPids();
      expect(after.length).toBeGreaterThan(0);
      expect(after.filter((p) => before.includes(p))).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('logs the failure with its SQLSTATE and never the password or the pg client', async () => {
    const before = await idleBackendPids();
    expect(before.length).toBeGreaterThan(0);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await terminateAll(before);
      await new Promise((resolve) => setTimeout(resolve, 800));
      await opened!.db.execute(sql`SELECT 1`);

      const logged = spy.mock.calls.map((args) => args.map((a) => (typeof a === 'string' ? a : `<${typeof a}>`)).join(' '));
      const line = logged.find((l) => l.includes('57P01'));
      expect(line, `expected a 57P01 log line, got: ${JSON.stringify(logged)}`).toBeTruthy();
      // pg-pool sets err.client, which holds connectionParameters incl. the password.
      expect(logged.join('\n')).not.toContain(password);
      expect(logged.join('\n')).not.toContain('connectionParameters');
      expect(logged.join('\n')).not.toContain('<object>');
    } finally {
      spy.mockRestore();
    }
  });

  it('CONTROL: with the listener removed (pre-fix main) the process dies', () => {
    const stripped = runChild(true);
    expect(stripped.stdout).not.toContain('SURVIVED');
    expect(stripped.status, `spawn=${stripped.spawnError}\nstdout=${stripped.stdout}\nstderr=${stripped.stderr}`).not.toBe(0);
    expect(stripped.stderr).toContain('57P01');
  });

  it('the same harness survives when the listener is present', () => {
    const kept = runChild(false);
    expect(kept.status, `spawn=${kept.spawnError}\nstdout=${kept.stdout}\nstderr=${kept.stderr}`).toBe(0);
    expect(kept.stdout).toContain(`SURVIVED ${RUNTIME_ROLE}`);
    expect(kept.stderr).not.toContain(password);
  });
});
