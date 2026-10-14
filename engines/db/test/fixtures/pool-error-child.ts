/**
 * Child harness for `engines/db/test/pool-resilience.pg.test.ts` (finding N-1).
 *
 * It runs in its OWN process on purpose: the failure mode under test is process
 * death. pg-pool purges an idle client whose backend died and then emits
 * 'error' on the pool; with no listener that is an unhandled 'error' event and
 * Node exits. That cannot be observed from inside the vitest worker without
 * taking the whole run down with it.
 *
 * Environment:
 *   NILE_CHILD_URL    runtime-login URL (the DATABASE_URL shape the app uses)
 *   NILE_CHILD_STRIP  '1' removes the 'error' listener that openPostgres
 *                     attached, reproducing pre-fix `main`. Anything else keeps it.
 *
 * Exits 0 and prints `SURVIVED <role>` only if the process lived through the
 * kill AND the pool still serves queries as the runtime role.
 *
 * The backend kill is performed by the runtime login itself: a backend's owner
 * may signal it, so this needs no superuser.
 */
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { openPostgres } from '../../open.js';

const url = process.env.NILE_CHILD_URL;
const strip = process.env.NILE_CHILD_STRIP === '1';
if (!url) {
  console.error('NILE_CHILD_URL is required');
  process.exit(2);
}

const opened = await openPostgres({ url });
const pool = (opened.db as unknown as { $client: unknown }).$client;
if (!(pool instanceof pg.Pool)) {
  console.error('expected db.$client to be the pg.Pool openPostgres created');
  process.exit(2);
}

// Warm the pool so there is an idle client to kill.
await opened.db.execute(sql`SELECT 1`);
await new Promise((resolve) => setTimeout(resolve, 250));

const listenersBefore = pool.listenerCount('error');
if (strip) pool.removeAllListeners('error');
console.log(`CHILD listeners before=${listenersBefore} after=${pool.listenerCount('error')}`);

const killer = new pg.Client({ connectionString: url });
await killer.connect();
const pids = (
  await killer.query(
    `SELECT pid FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND datname = current_database()
        AND usename = current_user
        AND state = 'idle'`,
  )
).rows.map((r: { pid: number }) => Number(r.pid));
console.log(`CHILD terminating idle backend pids: ${pids.join(',') || '(none)'}`);
if (pids.length === 0) {
  console.error('CHILD found no idle pooled backend to terminate');
  process.exit(2);
}
for (const pid of pids) await killer.query('SELECT pg_terminate_backend($1)', [pid]);

// Give the FATAL (57P01) time to reach the client and be handled — or not.
await new Promise((resolve) => setTimeout(resolve, 1500));

await opened.db.execute(sql`SELECT 1`);
await new Promise((resolve) => setTimeout(resolve, 250));
const res = (await opened.db.execute(sql`SELECT current_user AS role`)) as unknown as {
  rows: Array<{ role: string }>;
};
console.log(`SURVIVED ${res.rows[0]?.role} listeners=${pool.listenerCount('error')}`);
await killer.end().catch(() => {});
await opened.close();
process.exit(0);
