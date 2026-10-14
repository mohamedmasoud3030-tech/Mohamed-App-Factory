// H7: what does openPostgres do when SET ROLE nile_app cannot succeed, or when the login is a superuser?
import { openPostgres } from '../engines/db/open.ts';
const url = process.argv[2]!;
process.on('unhandledRejection', (e: any) => { console.log('UNHANDLED REJECTION →', e?.code, String(e?.message).slice(0, 60)); process.exit(3); });
try {
  const o = await openPostgres({ url });
  const r = await (o.db as any).$client.query('SELECT current_user u, session_user s');
  console.log('STARTED; current_user =', r.rows[0].u, '; session_user =', r.rows[0].s);
  await o.close();
} catch (e: any) {
  console.log('REFUSED TO START →', e?.code ?? '', String(e?.message).slice(0, 90));
  process.exit(2);
}
export {};
