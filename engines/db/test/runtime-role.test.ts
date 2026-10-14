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
});
