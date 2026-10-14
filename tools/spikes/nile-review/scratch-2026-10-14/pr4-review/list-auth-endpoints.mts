import { createAuth } from './engines/platform/src/auth/auth.ts';
import { openPglite } from './engines/db/open.ts';
const o = await openPglite();
const a = createAuth(o.db, { baseURL: 'http://x', secret: 'z'.repeat(48) });
const eps = Object.values(a.api as any).map((e: any) => `${(e.options?.method ?? '?').toString()} ${e.path}`).filter((s) => !s.endsWith('undefined')).sort();
console.log(eps.length, 'endpoints'); console.log(eps.join('\n'));
await o.close();
export {};
