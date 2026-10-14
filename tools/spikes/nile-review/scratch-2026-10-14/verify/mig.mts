import { openPglite } from '../engines/db/open.ts';
const o = await openPglite({ dataDir: '/tmp/drift/db' }); await o.close(); console.log('migrated via engines/db/open.ts');
