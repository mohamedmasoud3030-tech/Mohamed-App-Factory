/**
 * G-7 (post-merge security gate): the runtime connection must run as exactly
 * `nile_app`, not merely as "some role that cannot bypass RLS".
 * PGlite part: always runs. Real-PostgreSQL part: runtime-role.pg.test.ts.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertRuntimeRole, openPglite, RUNTIME_ROLE, UnsafeRuntimeRoleError, type NileDb, type OpenedDatabase } from '../open.js';

let opened: OpenedDatabase;
beforeAll(async () => {
  opened = await openPglite();
});
afterAll(() => opened.close());

describe('runtime role is exactly nile_app (G-7)', () => {
  it('openPglite runs as nile_app', async () => {
    expect(await assertRuntimeRole(opened.db)).toBe(RUNTIME_ROLE);
  });

  it('refuses a role that cannot bypass RLS but is not nile_app', async () => {
    const raw = new PGlite();
    // NOSUPERUSER NOBYPASSRLS: the previous check accepted any such role.
    await raw.exec(`CREATE ROLE not_nile_app NOLOGIN NOSUPERUSER NOBYPASSRLS; SET ROLE not_nile_app;`);
    await expect(assertRuntimeRole(drizzle(raw) as unknown as NileDb)).rejects.toBeInstanceOf(UnsafeRuntimeRoleError);
    await raw.close();
  });

  // The runtime role itself must not be able to bypass RLS, own objects or reach a stronger role.
  for (const [label, setup] of [
    ['nile_app with BYPASSRLS', `CREATE ROLE nile_app NOLOGIN BYPASSRLS`],
    ['nile_app owning a table', `CREATE ROLE nile_app NOLOGIN; CREATE TABLE t (id int); ALTER TABLE t OWNER TO nile_app`],
    [
      // regression: the system-schema filter must be the literal prefix "pg_", not the LIKE wildcard "pg" + any char
      'nile_app owning a table in a schema whose name starts with "pg" but not "pg_"',
      `CREATE ROLE nile_app NOLOGIN; CREATE SCHEMA pgx; CREATE TABLE pgx.t (id int); ALTER TABLE pgx.t OWNER TO nile_app`,
    ],
    [
      'nile_app able to SET ROLE to a role with more privileges',
      `CREATE ROLE nile_app NOLOGIN NOINHERIT; CREATE ROLE stronger NOLOGIN; GRANT stronger TO nile_app;
       CREATE TABLE t (id int); GRANT DELETE ON t TO stronger`,
    ],
  ] as const) {
    it(`refuses ${label}`, async () => {
      const raw = new PGlite();
      await raw.exec(`${setup}; SET ROLE nile_app;`);
      await expect(assertRuntimeRole(drizzle(raw) as unknown as NileDb)).rejects.toBeInstanceOf(UnsafeRuntimeRoleError);
      await raw.close();
    });
  }
});
