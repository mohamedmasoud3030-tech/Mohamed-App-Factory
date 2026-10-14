import { defineConfig } from 'drizzle-kit';
export default defineConfig({ dialect: 'postgresql', driver: 'pglite', schema: './engines/db/schema.ts', dbCredentials: { url: '/tmp/drift/db' } });
