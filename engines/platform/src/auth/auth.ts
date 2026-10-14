/**
 * Better Auth instance factory (ADR-0005). Framework-agnostic: the API mounts
 * `auth.handler` under Fastify; tests and seeds call `auth.api` directly.
 *
 * Security posture:
 *  - Public self-registration is DISABLED (demo accounts are seeded; real
 *    tenants are provisioned by Nile staff).
 *  - Passwords are hashed by Better Auth (scrypt) — never hand-rolled.
 *  - Sessions are DB-backed and revocable; cookies are HttpOnly.
 *  - On sign-in the session's activeOrganizationId is set from the user's
 *    server-side membership — never from client input (ADR-0005 §4).
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { organization as organizationPlugin } from 'better-auth/plugins';
import { asc, eq } from 'drizzle-orm';
import { authSchema, member } from './schema.js';
import { ac, roles } from './permissions.js';
import type { AnyPgDatabase } from '../db/with-tenant.js';

export interface AuthOptions {
  baseURL: string;
  secret: string;
  trustedOrigins?: string[] | ((request?: Request) => Promise<string[]>);
  production?: boolean;
}

export function createAuth(db: AnyPgDatabase, opts: AuthOptions) {
  return betterAuth({
    appName: 'Nile',
    baseURL: opts.baseURL,
    basePath: '/api/auth',
    secret: opts.secret,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trustedOrigins: opts.trustedOrigins as any,
    telemetry: { enabled: false },
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
    advanced: {
      database: { generateId: 'uuid' },
      useSecureCookies: opts.production ?? false,
    },
    rateLimit: { enabled: opts.production ?? false },
    plugins: [organizationPlugin({ ac, roles, allowUserToCreateOrganization: false })],
    databaseHooks: {
      session: {
        create: {
          before: async (s) => {
            const rows = await db
              .select({ organizationId: member.organizationId })
              .from(member)
              .where(eq(member.userId, s.userId))
              .orderBy(asc(member.createdAt))
              .limit(1);
            return { data: { ...s, activeOrganizationId: rows[0]?.organizationId ?? null } };
          },
        },
      },
    },
  });
}

export type NileAuth = ReturnType<typeof createAuth>;
