-- ADR-0005 §7 hardening that drizzle-kit cannot express. Custom migration
-- (drizzle-kit generate --custom), applied by the MIGRATION/owner role.
--
-- 1. Runtime role `nile_app`: NOT superuser, NOT BYPASSRLS, NOT table owner.
--    The application's login user is granted membership in it
--    (`GRANT nile_app TO <login>`) or the app `SET ROLE nile_app` at boot.
--    The app refuses to start if its effective role can bypass RLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nile_app') THEN
    CREATE ROLE nile_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO nile_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nile_app;
--> statement-breakpoint
-- Tables created later by the migration role inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nile_app;
--> statement-breakpoint
-- Drizzle's own bookkeeping table must stay out of reach of the runtime role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM nile_app;
  END IF;
END $$;
--> statement-breakpoint
-- 2. FORCE RLS on every tenant-owned table (defense in depth: binds the
--    owner too, so a misconfigured runtime role still fails closed).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- 3. Tenant registry must not be enumerable through a tenant-scoped role in
--    the future: no DELETE on identity tables for the runtime role.
REVOKE DELETE ON "organization", "user", "account" FROM nile_app;
