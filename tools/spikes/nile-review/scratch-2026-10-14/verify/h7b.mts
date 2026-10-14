import { openPostgres } from '../engines/db/open.ts';
const o = await openPostgres({ url: process.argv[2]! });
console.log('STARTED (should not happen for nile_owner)');
await new Promise((r) => setTimeout(r, 1500)); await o.close();
export {};
