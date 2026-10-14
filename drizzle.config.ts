import { defineConfig } from 'drizzle-kit';

// ADR-0004: migrations are GENERATED from module-owned schemas and committed.
export default defineConfig({
  dialect: 'postgresql',
  schema: './engines/db/schema.ts',
  out: './engines/db/migrations',
  strict: true,
  verbose: true,
});
