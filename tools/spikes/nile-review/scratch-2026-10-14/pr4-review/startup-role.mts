import pg from 'pg'; export {};
const su = new pg.Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: 'postgres' }); await su.connect();
for (const q of [`CREATE ROLE nile_app NOLOGIN`, `CREATE ROLE member_login LOGIN`, `GRANT nile_app TO member_login`, `CREATE ROLE stranger_login LOGIN`]) await su.query(q);
await su.end();
const tryConn = async (user: string) => {
  const c = new pg.Client({ host: '127.0.0.1', port: 5433, user, database: 'postgres', options: '-c role=nile_app' });
  try { await c.connect(); const r = (await c.query(`select session_user s, current_user u`)).rows[0];
    await c.query('RESET ROLE'); const after = (await c.query(`select current_user u`)).rows[0].u;
    let setBack = 'n/a'; try { await c.query(`SET ROLE ${user}`); setBack = (await c.query(`select current_user u`)).rows[0].u; } catch (e: any) { setBack = 'ERR ' + e.code; }
    await c.end(); return { user, connected: true, ...r, afterResetRole: after, afterSetRoleToLogin: setBack };
  } catch (e: any) { return { user, connected: false, code: e.code, message: e.message }; }
};
console.log(JSON.stringify([await tryConn('member_login'), await tryConn('stranger_login'), await tryConn('postgres')], null, 1));
