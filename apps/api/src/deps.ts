import type { NileAuth } from '../../../engines/platform/src/auth/auth.js';
import type { NileDb } from '../../../engines/db/open.js';

/** Explicit DI token (no reliance on emitDecoratorMetadata). */
export const DEPS = Symbol('NILE_DEPS');

export interface Deps {
  db: NileDb;
  auth: NileAuth;
}
